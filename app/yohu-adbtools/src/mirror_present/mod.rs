//! 壳内投屏呈现：编译期系统硬解（ADR-v6-024/026/027/028）。
//!
//! Windows = Media Foundation → D3D11 YUV → HWND。macOS / Linux 预留，禁止 FFmpeg。
//! UI 上报稳定可用区；表面独占像素。解码会话跟 `mirror.start`/`stop` 走，表面跟舞台可见性走。

mod backend;
#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
mod scale;
mod stage;
#[cfg(windows)]
mod windows;

pub use backend::{AnnexBDecoder, Caps};
#[cfg(windows)]
pub use windows::MfDecoder;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

use tokio::sync::mpsc as tokio_mpsc;
use yohu_mirror::{FramePipe, MirrorService};
use yohu_protocol::{AppEvent, MirrorLayout, MIRROR_MIN_LAYOUT_PX};

use backend::Cmd;

#[cfg(windows)]
use windows::GeomHost;

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
    /// 主窗至多一块舞台表面（本期否决多设备同时投屏）。
    surface: Option<Sender<Cmd>>,
}

pub fn probe() -> Caps {
    #[cfg(windows)]
    {
        Caps {
            id: windows::ID,
            hevc: windows::hevc_available(),
        }
    }
    #[cfg(target_os = "macos")]
    {
        macos::probe()
    }
    #[cfg(target_os = "linux")]
    {
        linux::probe()
    }
    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        Caps {
            id: "none",
            hevc: false,
        }
    }
}

impl PresentHost {
    pub fn new(event_tx: tokio_mpsc::Sender<AppEvent>, mirror: Arc<MirrorService>) -> Arc<Self> {
        let caps = probe();
        #[cfg(windows)]
        let geom = GeomHost::new();
        tracing::info!(backend = caps.id, hevc_ok = caps.hevc, "投屏后端探测");
        Arc::new(Self {
            hevc_ok: AtomicBool::new(caps.hevc),
            event_tx,
            mirror,
            inner: Mutex::new(Inner {
                owner: 0,
                surface: None,
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

    /// 绑定解码管道。已有舞台则只换管道，禁止拆表面。
    pub fn attach(&self, serial: &str, generation: u64, pipe: Arc<FramePipe>) {
        if !self.ensure_surface(serial) {
            return;
        }
        let tx = {
            let inner = self.inner.lock().expect("present lock poisoned");
            inner.surface.clone()
        };
        if let Some(tx) = tx {
            let _ = tx.send(Cmd::BindPipe {
                serial: serial.to_string(),
                generation,
                pipe,
            });
        }
    }

    /// 停解码、舞台改画 chrome。表面仍在。
    pub fn unbind(&self, serial: &str) {
        let inner = self.inner.lock().expect("present lock poisoned");
        if let Some(tx) = inner.surface.as_ref() {
            let _ = tx.send(Cmd::UnbindPipe {
                serial: serial.to_string(),
            });
        }
    }

    pub fn layout(&self, layout: MirrorLayout) {
        if !layout.visible
            || layout.width < MIRROR_MIN_LAYOUT_PX
            || layout.height < MIRROR_MIN_LAYOUT_PX
        {
            tracing::info!(
                serial = %layout.serial,
                visible = layout.visible,
                w = layout.width,
                h = layout.height,
                "投屏舞台关闭（离开可用区）"
            );
            self.shutdown();
            return;
        }
        if !self.ensure_surface(&layout.serial) {
            return;
        }
        let tx = {
            let inner = self.inner.lock().expect("present lock poisoned");
            inner.surface.clone()
        };
        if let Some(tx) = tx {
            let _ = tx.send(Cmd::Layout(layout));
        }
    }

    pub fn screenshot(&self, serial: &str, path: &str) -> Result<(), String> {
        let (reply_tx, reply_rx) = std::sync::mpsc::channel();
        {
            let inner = self.inner.lock().expect("present lock poisoned");
            let tx = inner
                .surface
                .as_ref()
                .ok_or_else(|| "当前没有投屏画面".to_string())?;
            tx.send(Cmd::Screenshot {
                path: path.to_string(),
                reply: reply_tx,
            })
            .map_err(|_| "呈现线程已退出".to_string())?;
        }
        let _ = serial;
        reply_rx
            .recv_timeout(std::time::Duration::from_secs(5))
            .map_err(|_| "截图超时".to_string())?
    }

    /// 拆表面。只用于离开投屏页或进程退出，禁止跟 `mirror.stop` 绑在一起。
    pub fn shutdown(&self) {
        if let Some(tx) = self
            .inner
            .lock()
            .expect("present lock poisoned")
            .surface
            .take()
        {
            let _ = tx.send(Cmd::Shutdown);
        }
    }

    fn ensure_surface(&self, serial: &str) -> bool {
        {
            let inner = self.inner.lock().expect("present lock poisoned");
            if inner.surface.is_some() {
                return true;
            }
            if inner.owner == 0 {
                tracing::error!("投屏表面尚未绑定主窗口");
                return false;
            }
        }
        let owner = self.inner.lock().expect("present lock poisoned").owner;
        let tx = spawn_backend_surface(
            serial.to_string(),
            owner,
            Arc::clone(&self.mirror),
            self.event_tx.clone(),
            #[cfg(windows)]
            Arc::clone(&self.geom),
        );
        self.inner.lock().expect("present lock poisoned").surface = Some(tx);
        true
    }
}

fn spawn_backend_surface(
    serial: String,
    owner: isize,
    mirror: Arc<MirrorService>,
    event_tx: tokio_mpsc::Sender<AppEvent>,
    #[cfg(windows)] geom: Arc<GeomHost>,
) -> Sender<Cmd> {
    #[cfg(windows)]
    {
        windows::spawn_surface(serial, owner, mirror, event_tx, geom)
    }
    #[cfg(target_os = "macos")]
    {
        macos::spawn_surface(serial, owner, mirror, event_tx)
    }
    #[cfg(target_os = "linux")]
    {
        linux::spawn_surface(serial, owner, mirror, event_tx)
    }
    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        let _ = (owner, mirror, event_tx);
        backend::spawn_unimplemented("none", &serial)
    }
}

#[cfg(test)]
mod tests {
    use super::probe;

    #[test]
    fn probe_id_is_stable() {
        let caps = probe();
        #[cfg(windows)]
        assert_eq!(caps.id, "media-foundation");
        #[cfg(target_os = "macos")]
        assert_eq!(caps.id, "videotoolbox");
        #[cfg(target_os = "linux")]
        assert_eq!(caps.id, "vaapi");
        assert!(!caps.id.is_empty());
    }
}
