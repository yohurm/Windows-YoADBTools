//! 投屏 HWND 的几何所有权：主窗客户区 insets + 画面宽高比。
//!
//! HWND 是主窗的 **WS_CHILD**（不是屏幕坐标 WS_POPUP）。拖动主窗由 USER32 带着走，
//! 禁止 JS `screenX` 轮询、禁止呈现线程在拖拽路径上 `SetWindowPos`。
//! 缩放时 chrome insets 不变，本模块在 owner `WM_WINDOWPOSCHANGING`（改尺寸）里重算 contain。

#![cfg(windows)]

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    GetClientRect, GetWindowRect, PostMessageW, SetWindowPos, ShowWindow, WINDOWPOS, HWND_TOP,
    SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOSIZE, SW_HIDE, SW_SHOWNOACTIVATE, WM_APP, WM_NCDESTROY,
    WM_WINDOWPOSCHANGING,
};

use super::scale::contain_in_zone;

const SUBCLASS_ID: usize = 0x594F4855;
const WM_LAYOUT: u32 = WM_APP + 0x4D;
const MIN_LAYOUT_PX: u32 = 64;

#[derive(Clone, Copy)]
struct Slot {
    hwnd: isize,
    inset_l: i32,
    inset_t: i32,
    inset_r: i32,
    inset_b: i32,
    video_w: u32,
    video_h: u32,
    visible: bool,
}

struct Data {
    owner: isize,
    hooked: bool,
    slots: HashMap<String, Slot>,
}

pub struct GeomHost {
    inner: Mutex<Data>,
}

impl GeomHost {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            inner: Mutex::new(Data {
                owner: 0,
                hooked: false,
                slots: HashMap::new(),
            }),
        })
    }

    pub fn set_owner(self: &Arc<Self>, hwnd: isize) {
        let mut g = self.inner.lock().expect("geom lock poisoned");
        if g.owner == hwnd && g.hooked {
            return;
        }
        if g.hooked && g.owner != 0 {
            unsafe {
                let _ = RemoveWindowSubclass(
                    HWND(g.owner as *mut _),
                    Some(subclass_proc),
                    SUBCLASS_ID,
                );
            }
            g.hooked = false;
        }
        g.owner = hwnd;
        if hwnd == 0 {
            return;
        }
        let ok = unsafe {
            SetWindowSubclass(
                HWND(hwnd as *mut _),
                Some(subclass_proc),
                SUBCLASS_ID,
                Arc::as_ptr(self) as usize,
            )
        };
        g.hooked = ok.as_bool();
        if !g.hooked {
            tracing::error!("投屏几何：主窗 subclass 失败");
        }
    }

    pub fn register(&self, serial: &str, hwnd: isize) {
        self.inner
            .lock()
            .expect("geom lock poisoned")
            .slots
            .insert(
                serial.to_string(),
                Slot {
                    hwnd,
                    inset_l: 0,
                    inset_t: 0,
                    inset_r: 0,
                    inset_b: 0,
                    video_w: 0,
                    video_h: 0,
                    visible: false,
                },
            );
    }

    pub fn unregister(&self, serial: &str) {
        self.inner
            .lock()
            .expect("geom lock poisoned")
            .slots
            .remove(serial);
    }

    /// JS 上报的是可用区相对主窗客户区的物理矩形；这里收成 insets。
    pub fn set_zone(&self, serial: &str, x: i32, y: i32, width: u32, height: u32, visible: bool) {
        let mut g = self.inner.lock().expect("geom lock poisoned");
        let owner = g.owner;
        let Some(slot) = g.slots.get_mut(serial) else {
            return;
        };
        slot.visible = visible;
        if let Some((cw, ch)) = client_size(owner) {
            slot.inset_l = x.max(0);
            slot.inset_t = y.max(0);
            slot.inset_r = (cw as i32 - x - width as i32).max(0);
            slot.inset_b = (ch as i32 - y - height as i32).max(0);
        }
        drop(g);
        post_layout(owner);
    }

    pub fn set_video(&self, serial: &str, width: u32, height: u32) {
        let mut g = self.inner.lock().expect("geom lock poisoned");
        let Some(slot) = g.slots.get_mut(serial) else {
            return;
        };
        if slot.video_w == width && slot.video_h == height {
            return;
        }
        slot.video_w = width;
        slot.video_h = height;
        let owner = g.owner;
        drop(g);
        post_layout(owner);
    }
}

fn post_layout(owner: isize) {
    if owner == 0 {
        return;
    }
    unsafe {
        let _ = PostMessageW(
            Some(HWND(owner as *mut _)),
            WM_LAYOUT,
            WPARAM(0),
            LPARAM(0),
        );
    }
}

fn client_size(owner: isize) -> Option<(u32, u32)> {
    if owner == 0 {
        return None;
    }
    unsafe {
        let mut cr = RECT::default();
        GetClientRect(HWND(owner as *mut _), &mut cr).ok()?;
        Some((
            (cr.right - cr.left).max(0) as u32,
            (cr.bottom - cr.top).max(0) as u32,
        ))
    }
}

fn predicted_client_size(owner: isize, wp: &WINDOWPOS) -> Option<(u32, u32)> {
    let (mut w, mut h) = client_size(owner)?;
    if wp.flags.contains(SWP_NOSIZE) {
        return Some((w, h));
    }
    unsafe {
        let mut wr = RECT::default();
        GetWindowRect(HWND(owner as *mut _), &mut wr).ok()?;
        w = (w as i32 + wp.cx - (wr.right - wr.left)).max(0) as u32;
        h = (h as i32 + wp.cy - (wr.bottom - wr.top)).max(0) as u32;
    }
    Some((w, h))
}

fn place_all(host: &GeomHost, client_w: u32, client_h: u32) {
    let slots: Vec<Slot> = host
        .inner
        .lock()
        .expect("geom lock poisoned")
        .slots
        .values()
        .copied()
        .collect();
    for slot in slots {
        place_one(slot, client_w, client_h);
    }
}

fn place_one(slot: Slot, client_w: u32, client_h: u32) {
    let hwnd = HWND(slot.hwnd as *mut _);
    if hwnd.0.is_null() {
        return;
    }
    if !slot.visible {
        unsafe {
            let _ = ShowWindow(hwnd, SW_HIDE);
        }
        return;
    }
    let zone_w = client_w
        .saturating_sub(slot.inset_l.max(0) as u32)
        .saturating_sub(slot.inset_r.max(0) as u32);
    let zone_h = client_h
        .saturating_sub(slot.inset_t.max(0) as u32)
        .saturating_sub(slot.inset_b.max(0) as u32);
    if zone_w < MIN_LAYOUT_PX || zone_h < MIN_LAYOUT_PX {
        unsafe {
            let _ = ShowWindow(hwnd, SW_HIDE);
        }
        return;
    }
    let (dx, dy, w, h) = contain_in_zone(zone_w, zone_h, slot.video_w, slot.video_h);
    if w < MIN_LAYOUT_PX || h < MIN_LAYOUT_PX {
        return;
    }
    let x = slot.inset_l + dx;
    let y = slot.inset_t + dy;
    unsafe {
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOP),
            x,
            y,
            w as i32,
            h as i32,
            SWP_NOACTIVATE | SWP_NOOWNERZORDER,
        );
        let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
    }
}

unsafe extern "system" fn subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    data: usize,
) -> LRESULT {
    let host = unsafe { &*(data as *const GeomHost) };
    match msg {
        WM_WINDOWPOSCHANGING if lparam.0 != 0 => {
            let wp = unsafe { &*(lparam.0 as *const WINDOWPOS) };
            if !wp.flags.contains(SWP_NOSIZE) {
                if let Some((cw, ch)) = predicted_client_size(hwnd.0 as isize, wp) {
                    place_all(host, cw, ch);
                }
            }
        }
        WM_LAYOUT => {
            if let Some((cw, ch)) = client_size(hwnd.0 as isize) {
                place_all(host, cw, ch);
            }
            return LRESULT(0);
        }
        WM_NCDESTROY => unsafe {
            let _ = RemoveWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID);
        },
        _ => {}
    }
    unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
}
