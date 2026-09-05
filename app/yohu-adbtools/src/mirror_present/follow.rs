//! 投屏 HWND 几何：铺满舞台 avail。占用卡片由 DComp clip 裁，不改 HWND 尺寸。
//!
//! HWND 是主窗的 **WS_CHILD**。拖动主窗由 USER32 带着走。
//! WebView 舞台是透明洞。可见卡片是 composition clip（圆角 + 描边），不是窗口外框。
//! `CreateSwapChainForComposition` 强制 `DXGI_SCALING_STRETCH`：禁止用 `SetWindowPos`
//! 改子窗尺寸冒充占用过渡（DWM 会拉扁上一帧）。fill↔contain 走 `IDCompositionAnimation`。
//! 本模块只在 avail / 主窗尺寸变化时 `SetWindowPos`。禁止 `SWP_NOCOPYBITS`；跨线程 `SWP_ASYNCWINDOWPOS`。

#![cfg(windows)]

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    GetClientRect, GetWindowRect, PostMessageW, SetWindowPos, ShowWindowAsync, HWND_TOP,
    SWP_ASYNCWINDOWPOS, SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOSIZE, SW_HIDE, WINDOWPOS, WM_APP,
    WM_NCDESTROY, WM_WINDOWPOSCHANGING,
};

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
    visible: bool,
    has_cur: bool,
    cur_x: i32,
    cur_y: i32,
    cur_w: u32,
    cur_h: u32,
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
                let _ =
                    RemoveWindowSubclass(HWND(g.owner as *mut _), Some(subclass_proc), SUBCLASS_ID);
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
            .insert(serial.to_string(), Slot::new(hwnd));
    }

    pub fn unregister(&self, serial: &str) {
        self.inner
            .lock()
            .expect("geom lock poisoned")
            .slots
            .remove(serial);
    }

    /// 可用区相对主窗客户区。HWND 始终铺满该区；占用 contain 不在这里改尺寸。
    pub fn set_occupancy(
        &self,
        serial: &str,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
        visible: bool,
    ) {
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
}

impl Slot {
    fn new(hwnd: isize) -> Self {
        Self {
            hwnd,
            inset_l: 0,
            inset_t: 0,
            inset_r: 0,
            inset_b: 0,
            visible: false,
            has_cur: false,
            cur_x: 0,
            cur_y: 0,
            cur_w: 0,
            cur_h: 0,
        }
    }
}

fn post_layout(owner: isize) {
    if owner == 0 {
        return;
    }
    unsafe {
        let _ = PostMessageW(Some(HWND(owner as *mut _)), WM_LAYOUT, WPARAM(0), LPARAM(0));
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

enum PlaceCmd {
    Hide(isize),
    Pos {
        hwnd: isize,
        x: i32,
        y: i32,
        w: u32,
        h: u32,
    },
}

fn place_all(host: &GeomHost, client_w: u32, client_h: u32) {
    let mut g = host.inner.lock().expect("geom lock poisoned");
    let keys: Vec<String> = g.slots.keys().cloned().collect();
    let mut cmds = Vec::with_capacity(keys.len());
    let mut logs = Vec::new();
    for k in keys {
        let Some(mut slot) = g.slots.get(&k).copied() else {
            continue;
        };
        if let Some(cmd) = step_slot(&mut slot, client_w, client_h) {
            if let PlaceCmd::Pos { x, y, w, h, .. } = cmd {
                logs.push((k.clone(), x, y, w, h));
            }
            cmds.push(cmd);
        }
        g.slots.insert(k, slot);
    }
    drop(g);
    for (serial, x, y, w, h) in logs {
        tracing::info!(serial = %serial, x, y, w, h, "HWND 铺满 avail");
    }
    for cmd in cmds {
        match cmd {
            PlaceCmd::Hide(hwnd) => unsafe {
                let _ = ShowWindowAsync(HWND(hwnd as *mut _), SW_HIDE);
            },
            PlaceCmd::Pos { hwnd, x, y, w, h } => apply_pos(HWND(hwnd as *mut _), x, y, w, h),
        }
    }
}

fn target_rect(slot: &Slot, client_w: u32, client_h: u32) -> Option<(i32, i32, u32, u32)> {
    if !slot.visible {
        return None;
    }
    let zone_w = client_w
        .saturating_sub(slot.inset_l.max(0) as u32)
        .saturating_sub(slot.inset_r.max(0) as u32);
    let zone_h = client_h
        .saturating_sub(slot.inset_t.max(0) as u32)
        .saturating_sub(slot.inset_b.max(0) as u32);
    if zone_w < MIN_LAYOUT_PX || zone_h < MIN_LAYOUT_PX {
        return None;
    }
    Some((slot.inset_l, slot.inset_t, zone_w, zone_h))
}

fn step_slot(slot: &mut Slot, client_w: u32, client_h: u32) -> Option<PlaceCmd> {
    if slot.hwnd == 0 {
        slot.has_cur = false;
        return None;
    }
    let hwnd = slot.hwnd;
    let Some((x, y, w, h)) = target_rect(slot, client_w, client_h) else {
        slot.has_cur = false;
        return Some(PlaceCmd::Hide(hwnd));
    };
    let same = slot.has_cur
        && slot.cur_x == x
        && slot.cur_y == y
        && slot.cur_w == w
        && slot.cur_h == h;
    slot.has_cur = true;
    slot.cur_x = x;
    slot.cur_y = y;
    slot.cur_w = w;
    slot.cur_h = h;
    if same {
        None
    } else {
        Some(PlaceCmd::Pos { hwnd, x, y, w, h })
    }
}

fn apply_pos(hwnd: HWND, x: i32, y: i32, w: u32, h: u32) {
    unsafe {
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOP),
            x,
            y,
            w as i32,
            h as i32,
            SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_ASYNCWINDOWPOS,
        );
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
