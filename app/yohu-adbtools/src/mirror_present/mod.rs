//! 壳内投屏呈现：Media Foundation → D3D11 YUV → 对齐面板的 HWND（ADR-v6-024）。

mod scale;
#[cfg(windows)]
mod follow;
#[cfg(windows)]
mod gpu;
#[cfg(windows)]
mod mf;
#[cfg(windows)]
pub use mf::MfDecoder;
#[cfg(windows)]
mod surface;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

use tokio::sync::mpsc as tokio_mpsc;
use yohu_mirror::{FramePipe, MirrorService};
use yohu_protocol::{AppEvent, MirrorLayout};

#[cfg(windows)]
use follow::GeomHost;
#[cfg(windows)]
use surface::Cmd;

pub struct PresentHost {
    hevc_ok: AtomicBool,
    event_tx: tokio_mpsc::Sender<AppEvent>,
    mirror: Arc<MirrorService>,
    inner: Mutex<Inner>,
    #[cfg(windows)]
    geom: Arc<GeomHost>,
}

struct Inner {
    owner: isize,
    sessions: HashMap<String, Sender<Cmd>>,
    pending_layout: HashMap<String, MirrorLayout>,
}

impl PresentHost {
    pub fn new(event_tx: tokio_mpsc::Sender<AppEvent>, mirror: Arc<MirrorService>) -> Arc<Self> {
        #[cfg(windows)]
        let hevc_ok = mf::hevc_available();
        #[cfg(not(windows))]
        let hevc_ok = false;
        #[cfg(windows)]
        let geom = GeomHost::new();
        tracing::info!(hevc_ok, "投屏 Media Foundation 探测");
        Arc::new(Self {
            hevc_ok: AtomicBool::new(hevc_ok),
            event_tx,
            mirror,
            inner: Mutex::new(Inner {
                owner: 0,
                sessions: HashMap::new(),
                pending_layout: HashMap::new(),
            }),
            #[cfg(windows)]
            geom,
        })
    }

    pub fn hevc_ok(&self) -> bool {
        self.hevc_ok.load(Ordering::SeqCst)
    }

    pub fn set_owner(&self, hwnd: isize) {
        self.inner.lock().expect("present lock poisoned").owner = hwnd;
        #[cfg(windows)]
        self.geom.set_owner(hwnd);
    }

    pub fn attach(&self, serial: &str, generation: u64, pipe: Arc<FramePipe>) {
        self.detach(serial);
        #[cfg(windows)]
        {
            let owner = self.inner.lock().expect("present lock poisoned").owner;
            if owner == 0 {
                tracing::error!("投屏 HWND 尚未绑定主窗口");
                return;
            }
            let tx = surface::spawn_session(
                serial.to_string(),
                generation,
                owner,
                pipe,
                Arc::clone(&self.mirror),
                self.event_tx.clone(),
                Arc::clone(&self.geom),
            );
            let pending = {
                let mut inner = self.inner.lock().expect("present lock poisoned");
                let pending = inner.pending_layout.remove(serial);
                inner.sessions.insert(serial.to_string(), tx.clone());
                pending
            };
            if let Some(layout) = pending {
                tracing::info!(
                    serial,
                    w = layout.width,
                    h = layout.height,
                    visible = layout.visible,
                    "投屏 attach 回放暂存 layout"
                );
                let _ = tx.send(Cmd::Layout(layout));
            }
        }
        #[cfg(not(windows))]
        {
            let _ = (generation, pipe);
            tracing::error!(serial, "投屏呈现仅支持 Windows");
        }
    }

    pub fn layout(&self, layout: MirrorLayout) {
        #[cfg(windows)]
        {
            let mut inner = self.inner.lock().expect("present lock poisoned");
            if let Some(tx) = inner.sessions.get(&layout.serial) {
                let _ = tx.send(Cmd::Layout(layout));
            } else if layout.visible && layout.width >= 64 && layout.height >= 64 {
                tracing::info!(
                    serial = %layout.serial,
                    w = layout.width,
                    h = layout.height,
                    "投屏 layout 暂存（呈现尚未 attach）"
                );
                inner.pending_layout.insert(layout.serial.clone(), layout);
            } else {
                tracing::debug!(
                    serial = %layout.serial,
                    w = layout.width,
                    h = layout.height,
                    visible = layout.visible,
                    "投屏 layout 丢弃（无会话）"
                );
            }
        }
        #[cfg(not(windows))]
        {
            let _ = layout;
        }
    }

    pub fn screenshot(&self, serial: &str, path: &str) -> Result<(), String> {
        #[cfg(windows)]
        {
            let (reply_tx, reply_rx) = std::sync::mpsc::channel();
            {
                let inner = self.inner.lock().expect("present lock poisoned");
                let tx = inner
                    .sessions
                    .get(serial)
                    .ok_or_else(|| "当前没有投屏画面".to_string())?;
                tx.send(Cmd::Screenshot {
                    path: path.to_string(),
                    reply: reply_tx,
                })
                .map_err(|_| "呈现线程已退出".to_string())?;
            }
            reply_rx
                .recv_timeout(std::time::Duration::from_secs(5))
                .map_err(|_| "截图超时".to_string())?
        }
        #[cfg(not(windows))]
        {
            let _ = (serial, path);
            Err("投屏呈现仅支持 Windows".into())
        }
    }

    pub fn detach(&self, serial: &str) {
        #[cfg(windows)]
        {
            if let Some(tx) = self
                .inner
                .lock()
                .expect("present lock poisoned")
                .sessions
                .remove(serial)
            {
                let _ = tx.send(Cmd::Stop);
            }
        }
        #[cfg(not(windows))]
        {
            let _ = serial;
        }
    }

    pub fn detach_all(&self) {
        #[cfg(windows)]
        {
            let sessions = std::mem::take(
                &mut self.inner.lock().expect("present lock poisoned").sessions,
            );
            for (_, tx) in sessions {
                let _ = tx.send(Cmd::Stop);
            }
        }
    }
}

#[cfg(not(windows))]
enum Cmd {}
