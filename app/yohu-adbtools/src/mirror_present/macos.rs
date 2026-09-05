//! 预留：VideoToolbox（VTDecompressionSession）+ IOSurface / Metal。
//!
//! 禁止用 FFmpeg 或 libavcodec 的 videotoolbox 封装填这个模块。

use std::sync::mpsc::Sender;
use std::sync::Arc;

use tokio::sync::mpsc as tokio_mpsc;
use yohu_mirror::MirrorService;
use yohu_protocol::AppEvent;

use super::backend::{spawn_unimplemented, AnnexBDecoder, Caps, Cmd};

pub const ID: &str = "videotoolbox";

pub fn probe() -> Caps {
    Caps {
        id: ID,
        hevc: false,
    }
}

pub fn spawn_surface(
    serial: String,
    _owner: isize,
    _mirror: Arc<MirrorService>,
    _event_tx: tokio_mpsc::Sender<AppEvent>,
) -> Sender<Cmd> {
    spawn_unimplemented(ID, &serial)
}

#[allow(dead_code)]
pub struct VideoToolboxDecoder {
    width: u32,
    height: u32,
}

pub enum VtPicture {}

impl AnnexBDecoder for VideoToolboxDecoder {
    type Picture = VtPicture;
    type Bind = ();

    fn open(
        _hevc: bool,
        _width: u32,
        _height: u32,
        _bind: Option<&Self::Bind>,
    ) -> Result<Self, String> {
        Err("macOS 投屏后端未实现：预留 VideoToolbox，禁止用 FFmpeg 填坑".into())
    }

    fn width(&self) -> u32 {
        self.width
    }

    fn height(&self) -> u32 {
        self.height
    }

    fn feed(&mut self, _annexb: &[u8], _keyframe: bool) -> Result<Option<Self::Picture>, String> {
        Err("macOS 投屏后端未实现：预留 VideoToolbox，禁止用 FFmpeg 填坑".into())
    }

    fn drain(&mut self) -> Result<Option<Self::Picture>, String> {
        Err("macOS 投屏后端未实现：预留 VideoToolbox，禁止用 FFmpeg 填坑".into())
    }
}
