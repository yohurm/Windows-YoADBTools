//! yohu-mirror — 官方 scrcpy-server 4.1 + 自写桌面客户端。
//!
//! 依赖方向：yohu-mirror → yohu-adb / yohu-runtime / yohu-domain → yohu-protocol。
//! 零 Tauri。编码包经 [`frame::FramePipe`] 交给壳泵二进制 Channel。

pub mod b64;
pub mod control;
pub mod demux;
pub mod error;
pub mod frame;
pub mod service;
pub mod session;
pub mod tunnel;

pub use error::MirrorError;
pub use frame::{decode_frame, encode_frame, EncodedFrame, FramePipe};
pub use service::MirrorService;
pub use session::save_png;
