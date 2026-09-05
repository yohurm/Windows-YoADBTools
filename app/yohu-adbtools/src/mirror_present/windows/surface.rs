//! 呈现线程：只调度 `Cmd` → Stage / DecodeBind / Gpu。
//!
//! 舞台可见性寿命在 HWND + [`super::host::Host`]；解码寿命在本线程的 [`DecodeBind`]。

#![cfg(windows)]

use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::mpsc as tokio_mpsc;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Gdi::InvalidateRect;
use windows::Win32::UI::WindowsAndMessaging::DestroyWindow;
use yohu_mirror::MirrorService;
use yohu_protocol::AppEvent;

use super::decode::DecodeBind;
use super::follow::GeomHost;
use super::gpu::Gpu;
use super::host::{self, Host};
use super::mf::DecodedPicture;
use super::window;
use crate::mirror_present::backend::Cmd;

const PRESENT_IDLE: Duration = Duration::from_millis(4);

pub fn spawn_surface(
    serial: String,
    owner: isize,
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
                owner,
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
    owner: isize,
    mirror: Arc<MirrorService>,
    event_tx: tokio_mpsc::Sender<AppEvent>,
    geom: Arc<GeomHost>,
}

fn run_loop(ctx: PresentCtx, rx: Receiver<Cmd>) -> Result<(), String> {
    let PresentCtx {
        serial,
        owner,
        mirror,
        event_tx,
        geom,
    } = ctx;
    super::mf::ensure_startup()?;
    window::register_class()?;
    let hwnd = window::create_child(HWND(owner as *mut _))?;
    geom.register(&serial, hwnd.0 as isize);
    let gpu = Gpu::new(hwnd, 16, 16).map_err(|e| e.to_string())?;
    host::install(
        hwnd,
        Host::new(serial, gpu, mirror, event_tx, Arc::clone(&geom)),
    );

    let mut decode: Option<DecodeBind> = None;
    let mut beat = Instant::now();
    let mut spin_at = Instant::now();
    let mut spin = 0.0_f32;
    loop {
        window::pump_messages(hwnd);
        host::with_host(hwnd, |h| h.sync_host_size(hwnd));
        match rx.recv_timeout(PRESENT_IDLE) {
            Ok(Cmd::Shutdown) | Err(RecvTimeoutError::Disconnected) => break,
            Ok(cmd) => dispatch(hwnd, cmd, &mut decode),
            Err(RecvTimeoutError::Timeout) => {}
        }
        if !drain_cmds(&rx, hwnd, &mut decode) {
            break;
        }
        if let Some(bind) = decode.as_mut() {
            tick_decode(hwnd, bind);
        }
        host::with_host(hwnd, |h| h.sync_host_size(hwnd));
        if host::loading(hwnd) && spin_at.elapsed() >= Duration::from_millis(50) {
            spin_at = Instant::now();
            spin = (spin + 0.28) % (std::f32::consts::PI * 2.0);
        }
        host::present_chrome(hwnd, spin);
        if beat.elapsed() >= Duration::from_secs(1) {
            if let Some(bind) = decode.as_mut() {
                bind.tick.log_beat();
            }
            beat = Instant::now();
        }
    }

    drop(decode);
    let serial = host::uninstall(hwnd).unwrap_or_default();
    geom.unregister(&serial);
    unsafe {
        let _ = DestroyWindow(hwnd);
        let _ = InvalidateRect(Some(HWND(owner as *mut _)), None, true);
    }
    Ok(())
}

fn dispatch(hwnd: HWND, cmd: Cmd, decode: &mut Option<DecodeBind>) {
    match cmd {
        Cmd::Layout(layout) => {
            let applied = host::with_host(hwnd, |h| h.apply_layout(hwnd, &layout));
            if applied.is_none() {
                tracing::warn!(
                    w = layout.width,
                    h = layout.height,
                    visible = layout.visible,
                    "投屏 layout 丢弃：HWND 尚未就绪"
                );
            }
        }
        Cmd::BindPipe {
            serial,
            generation,
            pipe,
        } => {
            if host::with_host(hwnd, |h| h.bind(hwnd, serial, generation)).is_some() {
                *decode = Some(DecodeBind::new(pipe));
            }
        }
        Cmd::UnbindPipe { serial } => {
            let drop_bind = host::with_host(hwnd, |h| h.unbind(&serial)).unwrap_or(false);
            if drop_bind {
                *decode = None;
            }
        }
        Cmd::Screenshot { path, reply } => {
            let result = host::with_host(hwnd, |h| h.screenshot(&path))
                .unwrap_or_else(|| Err("呈现已关闭".into()));
            let _ = reply.send(result);
        }
        Cmd::Shutdown => {}
    }
}

fn drain_cmds(rx: &Receiver<Cmd>, hwnd: HWND, decode: &mut Option<DecodeBind>) -> bool {
    loop {
        match rx.try_recv() {
            Ok(Cmd::Shutdown) | Err(TryRecvError::Disconnected) => return false,
            Err(TryRecvError::Empty) => return true,
            Ok(cmd) => dispatch(hwnd, cmd, decode),
        }
    }
}

fn tick_decode(hwnd: HWND, bind: &mut DecodeBind) {
    let frames = bind.pull();
    if !frames.is_empty() {
        if let Some(frame) = frames.iter().find(|f| f.width > 0 && f.height > 0) {
            host::with_host(hwnd, |h| h.adopt_encoded_size(frame.width, frame.height));
        }
        let manager = host::with_host(hwnd, |h| h.dxgi_manager()).flatten();
        if let Some((w, h, pic)) = bind.tick.ingest(manager.as_ref(), frames) {
            present_decoded(hwnd, bind, w, h, pic);
        }
    }
    if let Some((w, h, pic)) = bind.tick.drain() {
        present_decoded(hwnd, bind, w, h, pic);
    }
}

fn present_decoded(
    hwnd: HWND,
    bind: &mut DecodeBind,
    width: u32,
    height: u32,
    picture: DecodedPicture,
) {
    bind.tick
        .note_first_nv12(width, height, matches!(picture, DecodedPicture::Gpu { .. }));
    host::present_picture(hwnd, width, height, picture);
}
