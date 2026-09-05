//! 投屏 WS_CHILD：类注册、创建、泵消息、wndproc。不持舞台状态。

#![cfg(windows)]

use std::sync::{Mutex, Once};

use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{
    GetLastError, ERROR_CLASS_ALREADY_EXISTS, HWND, LPARAM, LRESULT, POINT, WPARAM,
};
use windows::Win32::Graphics::Gdi::{ScreenToClient, UpdateWindow, ValidateRect};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, LoadCursorW, PeekMessageW, RegisterClassExW,
    SetCursor, SetWindowPos, ShowWindow, TranslateMessage, CS_HREDRAW, CS_VREDRAW, HTTRANSPARENT,
    HWND_TOP, IDC_ARROW, MSG, PM_REMOVE, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_HIDE,
    WM_DESTROY, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEMOVE, WM_NCHITTEST, WM_PAINT, WM_RBUTTONDOWN,
    WM_RBUTTONUP, WM_SETCURSOR, WM_SIZE, WNDCLASSEXW, WS_CHILD, WS_CLIPSIBLINGS, WS_EX_NOACTIVATE,
    WS_EX_NOREDIRECTIONBITMAP,
};

use super::host;

const CLASS: PCWSTR = w!("YohuMirrorPresent");

pub fn register_class() -> Result<(), String> {
    static ONCE: Once = Once::new();
    static ERROR: Mutex<Option<String>> = Mutex::new(None);
    ONCE.call_once(|| {
        if let Err(e) = register_class_inner() {
            *ERROR.lock().unwrap_or_else(|p| p.into_inner()) = Some(e);
        }
    });
    match ERROR.lock() {
        Ok(guard) => guard.clone().map_or(Ok(()), Err),
        Err(poison) => poison.into_inner().clone().map_or(Ok(()), Err),
    }
}

fn register_class_inner() -> Result<(), String> {
    unsafe {
        let hinstance = GetModuleHandleW(None).map_err(|e| e.to_string())?;
        let wc = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(wnd_proc),
            hInstance: hinstance.into(),
            hCursor: LoadCursorW(None, IDC_ARROW).unwrap_or_default(),
            lpszClassName: CLASS,
            ..Default::default()
        };
        let atom = RegisterClassExW(&wc);
        if atom == 0 {
            // RegisterClassExW 失败时 GetLastError 是 Win32 码 1410。
            // Error::from_win32() 则是 HRESULT 0x80070582。旧代码用 `code().0 != 1410`
            // 把「类已存在」当成致命错误，第二次 spawn（开控制/重开）立刻退出。
            if GetLastError() != ERROR_CLASS_ALREADY_EXISTS {
                return Err(windows::core::Error::from_win32().to_string());
            }
        }
        Ok(())
    }
}

pub fn create_child(owner: HWND) -> Result<HWND, String> {
    unsafe {
        let hinstance = GetModuleHandleW(None).map_err(|e| e.to_string())?;
        let hwnd = CreateWindowExW(
            WS_EX_NOACTIVATE | WS_EX_NOREDIRECTIONBITMAP,
            CLASS,
            w!("Yohu Mirror"),
            WS_CHILD | WS_CLIPSIBLINGS,
            0,
            0,
            16,
            16,
            Some(owner),
            None,
            Some(hinstance.into()),
            None,
        )
        .map_err(|e| e.to_string())?;
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOP),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
        let _ = ShowWindow(hwnd, SW_HIDE);
        let _ = UpdateWindow(hwnd);
        Ok(hwnd)
    }
}

pub fn pump_messages(hwnd: HWND) {
    unsafe {
        let mut msg = MSG::default();
        let mut n = 0u32;
        while PeekMessageW(&mut msg, Some(hwnd), 0, 0, PM_REMOVE).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
            n += 1;
            if n >= 32 {
                break;
            }
        }
    }
}

unsafe extern "system" fn wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_SETCURSOR => {
            unsafe {
                let _ = SetCursor(LoadCursorW(None, IDC_ARROW).ok());
            }
            LRESULT(1)
        }
        WM_PAINT => {
            // DXGI Present 会使 HWND 失效。不能 BeginPaint：Present 同步派发
            // WM_PAINT 时会和交换链死锁，呈现线程卡在首帧之后。
            unsafe {
                let _ = ValidateRect(Some(hwnd), None);
            }
            LRESULT(0)
        }
        WM_SIZE => {
            host::with_host(hwnd, |h| h.sync_host_size(hwnd));
            LRESULT(0)
        }
        WM_NCHITTEST => occupancy_hit_test(hwnd, lparam),
        WM_DESTROY => LRESULT(0),
        WM_LBUTTONDOWN | WM_LBUTTONUP | WM_MOUSEMOVE | WM_RBUTTONDOWN | WM_RBUTTONUP => {
            let x = ((lparam.0 as i32) & 0xFFFF) as i16 as i32;
            let y = (((lparam.0 as i32) >> 16) & 0xFFFF) as i16 as i32;
            host::with_host(hwnd, |h| h.handle_pointer(msg, x, y));
            LRESULT(0)
        }
        _ => unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) },
    }
}

fn occupancy_hit_test(hwnd: HWND, lparam: LPARAM) -> LRESULT {
    let mut pt = POINT {
        x: (lparam.0 as u16) as i16 as i32,
        y: ((lparam.0 >> 16) as u16) as i16 as i32,
    };
    unsafe {
        let _ = ScreenToClient(hwnd, &mut pt);
    }
    let inside = host::with_host(hwnd, |h| h.hit_test(pt.x, pt.y)).unwrap_or(true);
    if inside {
        unsafe { DefWindowProcW(hwnd, WM_NCHITTEST, WPARAM(0), lparam) }
    } else {
        LRESULT(HTTRANSPARENT as isize)
    }
}
