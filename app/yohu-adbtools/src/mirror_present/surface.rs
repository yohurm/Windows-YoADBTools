//! 主窗 WS_CHILD + 消息循环：解码 / 输入 / Present。几何由 `follow` 持有。

#![cfg(windows)]

use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::sync::{Arc, Mutex, Once};
use std::time::{Duration, Instant};

use tokio::sync::mpsc as tokio_mpsc;
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{
    ERROR_CLASS_ALREADY_EXISTS, GetLastError, HWND, LPARAM, LRESULT, RECT, WPARAM,
};
use windows::Win32::Graphics::Gdi::{UpdateWindow, ValidateRect};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetWindowLongW,
    GetWindowLongPtrW, LoadCursorW, PeekMessageW, RegisterClassExW, SetCursor, SetWindowLongW,
    SetWindowLongPtrW, SetWindowPos, ShowWindow, TranslateMessage, CS_HREDRAW, CS_VREDRAW,
    GWL_EXSTYLE, GWLP_USERDATA, HWND_TOP, IDC_ARROW, MSG, PM_REMOVE, SWP_NOACTIVATE, SWP_NOMOVE,
    SWP_NOSIZE, SW_HIDE, SW_SHOWNOACTIVATE, WM_DESTROY, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEMOVE,
    WM_PAINT, WM_RBUTTONDOWN, WM_RBUTTONUP, WM_SETCURSOR, WNDCLASSEXW, WS_CHILD, WS_CLIPSIBLINGS,
    WS_EX_NOACTIVATE, WS_EX_NOREDIRECTIONBITMAP, WS_EX_TRANSPARENT,
    GetClientRect,
};
use yohu_mirror::{EncodedFrame, FramePipe, MirrorService};
use yohu_protocol::{AppEvent, MirrorControlMessage, MirrorLayout};

use super::follow::GeomHost;
use super::gpu::Gpu;
use super::mf::{DecodedPicture, MfDecoder};
use super::scale::{fit_letterbox, map_client_to_video, Letterbox};

const CLASS: PCWSTR = w!("YohuMirrorPresent");
const PRESENT_IDLE: Duration = Duration::from_millis(4);
const BUFFER_SETTLE: Duration = Duration::from_millis(64);
const MIN_LAYOUT_PX: u32 = 64;
const TOUCH_DOWN: u8 = 0;
const TOUCH_UP: u8 = 1;
const TOUCH_MOVE: u8 = 2;

pub enum Cmd {
    Layout(MirrorLayout),
    Screenshot {
        path: String,
        reply: Sender<Result<(), String>>,
    },
    Stop,
}

struct SurfaceState {
    serial: String,
    generation: u64,
    gpu: Option<Gpu>,
    video_w: u32,
    video_h: u32,
    dest: Letterbox,
    control: bool,
    visible: bool,
    pressing: bool,
    painted: u32,
    fps_at: Instant,
    last_fps: u32,
    has_frame: bool,
    mirror: Arc<MirrorService>,
    event_tx: tokio_mpsc::Sender<AppEvent>,
    geom: Arc<GeomHost>,
    layout_w: u32,
    layout_h: u32,
    layout_r: u32,
    skip_logged: Option<(bool, u32, u32)>,
    present_err_logged: bool,
    buf_due: Option<Instant>,
}

pub fn spawn_session(
    serial: String,
    generation: u64,
    owner: isize,
    pipe: Arc<FramePipe>,
    mirror: Arc<MirrorService>,
    event_tx: tokio_mpsc::Sender<AppEvent>,
    geom: Arc<GeomHost>,
) -> Sender<Cmd> {
    let (tx, rx) = mpsc::channel::<Cmd>();
    std::thread::Builder::new()
        .name(format!("mirror-present-{serial}"))
        .spawn(move || {
            let ctx = PresentCtx {
                serial,
                generation,
                owner,
                pipe,
                mirror,
                event_tx,
                geom,
            };
            if let Err(e) = run_loop(ctx, rx) {
                tracing::error!("投屏呈现退出: {e}");
            }
        })
        .expect("spawn present thread");
    tx
}

struct PresentCtx {
    serial: String,
    generation: u64,
    owner: isize,
    pipe: Arc<FramePipe>,
    mirror: Arc<MirrorService>,
    event_tx: tokio_mpsc::Sender<AppEvent>,
    geom: Arc<GeomHost>,
}

fn run_loop(ctx: PresentCtx, rx: Receiver<Cmd>) -> Result<(), String> {
    let PresentCtx {
        serial,
        generation,
        owner,
        pipe,
        mirror,
        event_tx,
        geom,
    } = ctx;
    super::mf::ensure_startup()?;
    register_class()?;
    let hwnd = create_child(HWND(owner as *mut _))?;
    geom.register(&serial, hwnd.0 as isize);
    let gpu = Gpu::new(hwnd, 16, 16).map_err(|e| e.to_string())?;
    let state = Box::new(Mutex::new(SurfaceState {
        serial: serial.clone(),
        generation,
        gpu: Some(gpu),
        video_w: 0,
        video_h: 0,
        dest: Letterbox {
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            nearest: false,
        },
        control: false,
        visible: false,
        pressing: false,
        painted: 0,
        fps_at: Instant::now(),
        last_fps: 0,
        has_frame: false,
        mirror,
        event_tx,
        geom: Arc::clone(&geom),
        layout_w: 0,
        layout_h: 0,
        layout_r: 0,
        skip_logged: None,
        present_err_logged: false,
        buf_due: None,
    }));
    unsafe {
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, Box::into_raw(state) as isize);
    }

    let mut tick = DecodeTick::new();
    let mut beat = Instant::now();
    loop {
        pump_messages(hwnd);
        match rx.recv_timeout(PRESENT_IDLE) {
            Ok(Cmd::Stop) | Err(RecvTimeoutError::Disconnected) => break,
            Ok(Cmd::Layout(layout)) => apply_layout(hwnd, &layout),
            Ok(Cmd::Screenshot { path, reply }) => {
                let result = screenshot(hwnd, &path);
                let _ = reply.send(result);
            }
            Err(RecvTimeoutError::Timeout) => {}
        }
        if !drain_cmds(&rx, hwnd) {
            break;
        }
        // 解码不跟 layout：visible=false 时仍要吃帧，否则队列撑满、首帧永远进不了 Present。
        let frames = drain_pipe(&pipe);
        if !frames.is_empty() {
            tick.ingest(hwnd, frames);
        }
        tick.drain(hwnd);
        sync_host_size(hwnd);
        realize_buffers_if_due(hwnd);
        if beat.elapsed() >= Duration::from_secs(1) {
            tick.log_beat();
            beat = Instant::now();
        }
    }

    geom.unregister(&serial);
    drop(tick);
    unsafe {
        let ptr = SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
        if ptr != 0 {
            drop(Box::from_raw(ptr as *mut Mutex<SurfaceState>));
        }
        let _ = DestroyWindow(hwnd);
    }
    Ok(())
}

struct DecodeTick {
    decoder: Option<MfDecoder>,
    failed: bool,
    last_config: Option<Vec<u8>>,
    first_nv12: bool,
    started: Instant,
    fed: u32,
    decoded: u32,
}

impl DecodeTick {
    fn new() -> Self {
        Self {
            decoder: None,
            failed: false,
            last_config: None,
            first_nv12: false,
            started: Instant::now(),
            fed: 0,
            decoded: 0,
        }
    }

    fn ingest(&mut self, hwnd: HWND, frames: Vec<EncodedFrame>) {
        let mut last = None;
        let mut out_w = 0;
        let mut out_h = 0;
        for frame in select_live_frames(&mut self.last_config, frames) {
            if let Some(pic) = self.decode(hwnd, frame) {
                if let Some(dec) = self.decoder.as_ref() {
                    out_w = dec.width;
                    out_h = dec.height;
                }
                last = Some(pic);
            }
        }
        if let Some(pic) = last {
            on_picture(hwnd, &mut self.first_nv12, self.started, out_w, out_h, pic);
        }
    }

    fn drain(&mut self, hwnd: HWND) {
        let Some(dec) = self.decoder.as_mut() else {
            return;
        };
        match dec.drain() {
            Ok(Some(pic)) => {
                self.decoded += 1;
                let w = dec.width;
                let h = dec.height;
                on_picture(hwnd, &mut self.first_nv12, self.started, w, h, pic);
            }
            Ok(None) => {}
            Err(e) => {
                tracing::error!(error = %e, "MF drain 失败");
                self.decoder = None;
                self.failed = true;
            }
        }
    }

    fn log_beat(&mut self) {
        if self.fed > 0 || self.decoded > 0 {
            tracing::info!(
                fed = self.fed,
                decoded = self.decoded,
                "MF 解码节拍"
            );
        }
        self.fed = 0;
        self.decoded = 0;
    }

    fn decode(&mut self, hwnd: HWND, frame: EncodedFrame) -> Option<DecodedPicture> {
        if self.decoder.as_ref().map(|d| (d.width, d.height)) != Some((frame.width, frame.height)) {
            self.decoder = None;
            self.failed = false;
        }
        if self.decoder.is_none() && !self.failed && frame.width > 0 && frame.height > 0 {
            let hevc = frame.codec == 1;
            let manager = with_state(hwnd, |s| s.gpu.as_ref().and_then(|g| g.dxgi_manager())).flatten();
            match MfDecoder::open_with(hevc, frame.width, frame.height, manager.as_ref()) {
                Ok(dec) => {
                    tracing::info!(
                        hevc,
                        async_mft = dec.is_async(),
                        d3d11 = dec.uses_d3d(),
                        width = frame.width,
                        height = frame.height,
                        elapsed_ms = self.started.elapsed().as_millis() as u64,
                        "MF 解码器已启动"
                    );
                    self.decoder = Some(dec);
                }
                Err(e) => {
                    tracing::error!(
                        error = %e,
                        width = frame.width,
                        height = frame.height,
                        hevc = frame.codec == 1,
                        "MF 解码器启动失败，本会话不再重试"
                    );
                    self.failed = true;
                    return None;
                }
            }
        }
        let dec = self.decoder.as_mut()?;
        let payload = access_unit(self.last_config.as_deref(), &frame.payload, frame.keyframe);
        self.fed += 1;
        match dec.feed(&payload, frame.keyframe) {
            Ok(Some(pic)) => {
                self.decoded += 1;
                Some(pic)
            }
            Ok(None) => None,
            Err(e) => {
                tracing::error!(error = %e, "MF 解码失败，本会话不再重试");
                self.decoder = None;
                self.failed = true;
                None
            }
        }
    }
}

fn drain_cmds(rx: &Receiver<Cmd>, hwnd: HWND) -> bool {
    loop {
        match rx.try_recv() {
            Ok(Cmd::Layout(layout)) => apply_layout(hwnd, &layout),
            Ok(Cmd::Screenshot { path, reply }) => {
                let _ = reply.send(screenshot(hwnd, &path));
            }
            Ok(Cmd::Stop) | Err(TryRecvError::Disconnected) => return false,
            Err(TryRecvError::Empty) => return true,
        }
    }
}

fn drain_pipe(pipe: &FramePipe) -> Vec<EncodedFrame> {
    let mut frames = Vec::new();
    while let Some(frame) = pipe.try_recv() {
        frames.push(frame);
    }
    frames
}

fn select_live_frames(
    last_config: &mut Option<Vec<u8>>,
    frames: Vec<EncodedFrame>,
) -> Vec<EncodedFrame> {
    for frame in &frames {
        if frame.config {
            *last_config = Some(frame.payload.clone());
        }
    }
    frames.into_iter().filter(|f| !f.config).collect()
}

fn access_unit(config: Option<&[u8]>, payload: &[u8], keyframe: bool) -> Vec<u8> {
    if keyframe {
        if let Some(cfg) = config {
            let mut au = Vec::with_capacity(cfg.len() + payload.len());
            au.extend_from_slice(cfg);
            au.extend_from_slice(payload);
            return au;
        }
    }
    payload.to_vec()
}

fn on_picture(
    hwnd: HWND,
    first_nv12: &mut bool,
    started: Instant,
    width: u32,
    height: u32,
    picture: DecodedPicture,
) {
    if !*first_nv12 {
        *first_nv12 = true;
        tracing::info!(
            elapsed_ms = started.elapsed().as_millis() as u64,
            width,
            height,
            gpu = matches!(picture, DecodedPicture::Gpu { .. }),
            "MF 首帧"
        );
    }
    present_picture(hwnd, width, height, picture);
}

fn present_picture(hwnd: HWND, width: u32, height: u32, picture: DecodedPicture) {
    let prepared = with_state(hwnd, |s| {
        s.video_w = width;
        s.video_h = height;
        s.geom.set_video(&s.serial, width, height);
        if !s.visible || s.layout_w < MIN_LAYOUT_PX || s.layout_h < MIN_LAYOUT_PX {
            let key = (s.visible, s.layout_w, s.layout_h);
            if s.skip_logged != Some(key) {
                s.skip_logged = Some(key);
                tracing::warn!(
                    serial = %s.serial,
                    visible = s.visible,
                    layout_w = s.layout_w,
                    layout_h = s.layout_h,
                    "投屏 Present 跳过：等待有效 layout"
                );
            }
            return None;
        }
        s.skip_logged = None;
        let gpu = s.gpu.take()?;
        s.dest = fit_letterbox(width, height, s.layout_w, s.layout_h);
        Some((gpu, s.dest))
    })
    .flatten();
    let Some((mut gpu, dest)) = prepared else {
        return;
    };
    let drawn = match &picture {
        DecodedPicture::Nv12(nv12) => gpu.present_cpu_nv12(width, height, nv12, dest),
        DecodedPicture::Gpu {
            texture,
            subresource,
            ..
        } => gpu.present_gpu_nv12(texture, *subresource, dest),
    };
    let presented = drawn.is_ok();
    let mut show = false;
    with_state(hwnd, |s| {
        s.gpu = Some(gpu);
        if !presented {
            if !s.present_err_logged {
                s.present_err_logged = true;
                if let Err(e) = &drawn {
                    tracing::warn!(error = %e, width, height, "投屏 Present 失败");
                }
            }
            return;
        }
        s.present_err_logged = false;
        s.painted += 1;
        let now = Instant::now();
        if !s.has_frame {
            s.has_frame = true;
            s.fps_at = now;
            s.painted = 0;
            tracing::info!(
                serial = %s.serial,
                generation = s.generation,
                width,
                height,
                "投屏首帧已 Present"
            );
            let _ = s.event_tx.try_send(AppEvent::MirrorPainted {
                serial: s.serial.clone(),
                generation: s.generation,
                painted_fps: 1,
            });
        } else if now.duration_since(s.fps_at) >= Duration::from_secs(1) {
            s.last_fps = s.painted;
            s.painted = 0;
            s.fps_at = now;
            let _ = s.event_tx.try_send(AppEvent::MirrorPainted {
                serial: s.serial.clone(),
                generation: s.generation,
                painted_fps: s.last_fps,
            });
        }
        show = s.visible && s.has_frame;
    });
    if show {
        unsafe {
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        }
    }
}

fn apply_layout(hwnd: HWND, layout: &MirrorLayout) {
    let applied = with_state(hwnd, |s| {
        s.control = layout.control;
        let mut bits = WS_EX_NOACTIVATE.0 | WS_EX_NOREDIRECTIONBITMAP.0;
        if !layout.control {
            bits |= WS_EX_TRANSPARENT.0;
        }
        let ex = bits as i32;
        unsafe {
            let cur = GetWindowLongW(hwnd, GWL_EXSTYLE);
            if cur != ex {
                let _ = SetWindowLongW(hwnd, GWL_EXSTYLE, ex);
            }
        }
        s.visible = layout.visible;
        s.layout_r = layout.corner_radius;
        s.geom.set_zone(
            &s.serial,
            layout.x,
            layout.y,
            layout.width,
            layout.height,
            layout.visible,
        );
        tracing::info!(
            serial = %s.serial,
            x = layout.x,
            y = layout.y,
            w = layout.width,
            h = layout.height,
            visible = layout.visible,
            r = layout.corner_radius,
            control = layout.control,
            "投屏可用区已交给几何宿主"
        );
    });
    if applied.is_none() {
        tracing::warn!(
            w = layout.width,
            h = layout.height,
            visible = layout.visible,
            "投屏 layout 丢弃：HWND 尚未就绪"
        );
    }
}

fn sync_host_size(hwnd: HWND) {
    let mut rc = RECT::default();
    unsafe {
        if GetClientRect(hwnd, &mut rc).is_err() {
            return;
        }
    }
    let w = (rc.right - rc.left).max(0) as u32;
    let h = (rc.bottom - rc.top).max(0) as u32;
    with_state(hwnd, |s| {
        if w == s.layout_w && h == s.layout_h {
            return;
        }
        s.layout_w = w;
        s.layout_h = h;
        let Some(gpu) = s.gpu.as_mut() else {
            return;
        };
        if let Err(e) = gpu.clip_host(w.max(1), h.max(1), s.layout_r) {
            tracing::warn!(error = %e, "投屏圆角 clip 失败");
        }
        if w < MIN_LAYOUT_PX || h < MIN_LAYOUT_PX {
            return;
        }
        if s.has_frame {
            s.buf_due = Some(Instant::now() + BUFFER_SETTLE);
        } else if let Err(e) = gpu.resize(w, h) {
            tracing::error!(error = %e, w, h, "投屏 swapchain resize 失败");
        }
    });
}

fn realize_buffers_if_due(hwnd: HWND) {
    with_state(hwnd, |s| {
        let Some(due) = s.buf_due else {
            return;
        };
        if Instant::now() < due {
            return;
        }
        s.buf_due = None;
        let w = s.layout_w;
        let h = s.layout_h;
        if let Some(gpu) = s.gpu.as_mut() {
            if let Err(e) = gpu.resize(w, h) {
                tracing::error!(error = %e, w, h, "投屏 swapchain resize 失败");
            }
        }
    });
}

fn screenshot(hwnd: HWND, path: &str) -> Result<(), String> {
    let pixels = with_state(hwnd, |s| {
        s.gpu
            .as_mut()
            .ok_or_else(|| "尚无画面".into())
            .and_then(|g| g.screenshot_bgra().map_err(|e| e.to_string()))
    })
    .ok_or_else(|| "呈现已关闭".to_string())??;
    let (w, h, bgra) = pixels;
    let mut rgba = vec![0u8; bgra.len()];
    for (i, chunk) in bgra.chunks_exact(4).enumerate() {
        rgba[i * 4] = chunk[2];
        rgba[i * 4 + 1] = chunk[1];
        rgba[i * 4 + 2] = chunk[0];
        rgba[i * 4 + 3] = 255;
    }
    let file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    let mut encoder = png::Encoder::new(file, w, h);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
    writer.write_image_data(&rgba).map_err(|e| e.to_string())?;
    Ok(())
}

fn with_state<R>(hwnd: HWND, f: impl FnOnce(&mut SurfaceState) -> R) -> Option<R> {
    unsafe {
        let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA);
        if ptr == 0 {
            return None;
        }
        let mutex = &*(ptr as *const Mutex<SurfaceState>);
        let mut guard = mutex.lock().ok()?;
        Some(f(&mut guard))
    }
}

fn pump_messages(hwnd: HWND) {
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

fn register_class() -> Result<(), String> {
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

fn create_child(owner: HWND) -> Result<HWND, String> {
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

unsafe extern "system" fn wnd_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
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
        WM_DESTROY => LRESULT(0),
        WM_LBUTTONDOWN | WM_LBUTTONUP | WM_MOUSEMOVE | WM_RBUTTONDOWN | WM_RBUTTONUP => {
            handle_pointer(hwnd, msg, lparam);
            LRESULT(0)
        }
        _ => unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) },
    }
}

fn handle_pointer(hwnd: HWND, msg: u32, lparam: LPARAM) {
    let x = (lparam.0 as i32) & 0xFFFF;
    let y = ((lparam.0 as i32) >> 16) & 0xFFFF;
    // signed
    let x = x as i16 as i32;
    let y = y as i16 as i32;
    with_state(hwnd, |s| {
        if !s.control {
            return;
        }
        let Some((vx, vy)) = map_client_to_video(x, y, s.dest, s.video_w, s.video_h) else {
            return;
        };
        let action = match msg {
            WM_LBUTTONDOWN | WM_RBUTTONDOWN => {
                s.pressing = true;
                TOUCH_DOWN
            }
            WM_MOUSEMOVE => {
                if !s.pressing {
                    return;
                }
                TOUCH_MOVE
            }
            WM_LBUTTONUP | WM_RBUTTONUP => {
                s.pressing = false;
                TOUCH_UP
            }
            _ => return,
        };
        let serial = s.serial.clone();
        let width = s.video_w as u16;
        let height = s.video_h as u16;
        let mirror = Arc::clone(&s.mirror);
        let message = MirrorControlMessage::Touch {
            action,
            x: vx,
            y: vy,
            width,
            height,
        };
        tauri::async_runtime::spawn(async move {
            let _ = mirror.inject(&serial, message).await;
        });
    });
}
