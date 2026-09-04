//! 壳内投屏呈现：Media Foundation → D3D11 YUV → 舞台透明洞内 contain 的 HWND（ADR-v6-024/026/027）。
//!
//! UI 上报稳定可用区；HWND 按画面 contain，自身画占用卡片。无 HWND lerp，无 CSS 占用过渡。
//! HWND 生命周期跟舞台可见性走，解码会话跟 `mirror.start`/`stop` 走。两者不得绑死。

#[cfg(windows)]
mod chrome;
#[cfg(windows)]
mod follow;
#[cfg(windows)]
mod gpu;
#[cfg(windows)]
mod mf;
mod scale;
#[cfg(windows)]
pub use mf::MfDecoder;
#[cfg(windows)]
mod surface;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

use tokio::sync::mpsc as tokio_mpsc;
use yohu_mirror::{FramePipe, MirrorService};
use yohu_protocol::AppEvent;
use yohu_protocol::MirrorLayout;

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
    /// 主窗至多一块舞台 HWND（本期否决多设备同时投屏）。
    surface: Option<Sender<Cmd>>,
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

    /// 绑定解码管道。已有舞台则只换管道，禁止拆 HWND。
    pub fn attach(&self, serial: &str, generation: u64, pipe: Arc<FramePipe>) {
        #[cfg(windows)]
        {
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
        #[cfg(not(windows))]
        {
            let _ = (serial, generation, pipe);
            tracing::error!(serial, "投屏呈现仅支持 Windows");
        }
    }

    /// 停解码、舞台改画 chrome。HWND 仍在。
    pub fn unbind(&self, serial: &str) {
        #[cfg(windows)]
        {
            let inner = self.inner.lock().expect("present lock poisoned");
            if let Some(tx) = inner.surface.as_ref() {
                let _ = tx.send(Cmd::UnbindPipe {
                    serial: serial.to_string(),
                });
            }
        }
        #[cfg(not(windows))]
        {
            let _ = serial;
        }
    }

    pub fn layout(&self, layout: MirrorLayout) {
        #[cfg(windows)]
        {
            if !layout.visible || layout.width < 64 || layout.height < 64 {
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
        #[cfg(not(windows))]
        {
            let _ = (serial, path);
            Err("投屏呈现仅支持 Windows".into())
        }
    }

    /// 拆 HWND。只用于离开投屏页或进程退出，禁止跟 `mirror.stop` 绑在一起。
    pub fn shutdown(&self) {
        #[cfg(windows)]
        {
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
    }

    /// 兼容旧名：编码结束只 unbind，不拆表面。
    pub fn detach(&self, serial: &str) {
        self.unbind(serial);
    }

    pub fn detach_all(&self) {
        self.shutdown();
    }

    #[cfg(windows)]
    fn ensure_surface(&self, serial: &str) -> bool {
        {
            let inner = self.inner.lock().expect("present lock poisoned");
            if inner.surface.is_some() {
                return true;
            }
            if inner.owner == 0 {
                tracing::error!("投屏 HWND 尚未绑定主窗口");
                return false;
            }
        }
        let owner = self.inner.lock().expect("present lock poisoned").owner;
        let tx = surface::spawn_surface(
            serial.to_string(),
            owner,
            Arc::clone(&self.mirror),
            self.event_tx.clone(),
            Arc::clone(&self.geom),
        );
        self.inner.lock().expect("present lock poisoned").surface = Some(tx);
        true
    }
}

#[cfg(not(windows))]
enum Cmd {}
