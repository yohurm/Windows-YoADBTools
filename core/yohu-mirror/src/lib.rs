//! yohu-mirror — 官方 scrcpy-server 4.1 + 自写桌面客户端。
//!
//! 依赖方向：yohu-mirror → yohu-adb / yohu-runtime → yohu-protocol。
//! 零 Tauri。视频包经 `AppEvent::MirrorPacket` 推给 UI（WebCodecs 解码）。

pub mod b64;
pub mod control;
pub mod demux;
pub mod error;
pub mod service;
pub mod session;
pub mod tunnel;

pub use error::MirrorError;
pub use service::MirrorService;
pub use session::save_png;
