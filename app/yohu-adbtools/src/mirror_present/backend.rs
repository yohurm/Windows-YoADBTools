//! 投屏呈现后端契约（ADR-v6-028）。
//!
//! 编译期选一个 OS 后端。禁止 FFmpeg / libavcodec / ffmpeg.exe。
//! GPU 纹理类型是关联类型，不进本模块。

use std::sync::mpsc::Sender;

use yohu_mirror::FramePipe;
use yohu_protocol::MirrorLayout;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Caps {
    pub id: &'static str,
    pub hevc: bool,
}

pub enum Cmd {
    Layout(MirrorLayout),
    BindPipe {
        serial: String,
        generation: u64,
        pipe: std::sync::Arc<FramePipe>,
    },
    UnbindPipe {
        serial: String,
    },
    Screenshot {
        path: String,
        reply: Sender<Result<(), String>>,
    },
    Shutdown,
}

/// Annex-B 直播解码器。`Picture` / `Bind` 由后端自定，禁止在本 trait 上摊成 packed NV12。
///
/// Windows 热路径故意走 `MfDecoder` 固有方法，不为跨平台上 vtable。
#[allow(dead_code)]
pub trait AnnexBDecoder: Sized {
    type Picture;
    type Bind;

    fn open(hevc: bool, width: u32, height: u32, bind: Option<&Self::Bind>)
        -> Result<Self, String>;

    fn width(&self) -> u32;
    fn height(&self) -> u32;

    fn feed(&mut self, annexb: &[u8], keyframe: bool) -> Result<Option<Self::Picture>, String>;

    fn drain(&mut self) -> Result<Option<Self::Picture>, String>;
}

#[cfg(not(windows))]
pub fn spawn_unimplemented(id: &'static str, serial: &str) -> Sender<Cmd> {
    let (tx, rx) = std::sync::mpsc::channel();
    let label = format!("mirror-present-{id}-{serial}");
    let _ = std::thread::Builder::new().name(label).spawn(move || loop {
        match rx.recv() {
            Ok(Cmd::Screenshot { reply, .. }) => {
                let _ = reply.send(Err(format!(
                    "{id} 投屏后端未实现：预留系统硬解，禁止用 FFmpeg 填坑"
                )));
            }
            Ok(Cmd::Shutdown) | Err(_) => break,
            Ok(_) => {}
        }
    });
    tx
}
