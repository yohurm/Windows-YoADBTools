//! Windows 后端：Media Foundation + D3D11 + HWND（ADR-v6-024）。

pub mod chrome;
mod decode;
pub mod follow;
pub mod gpu;
mod host;
pub mod mf;
pub mod surface;
mod window;

pub const ID: &str = "media-foundation";

pub use follow::GeomHost;
pub use mf::{hevc_available, MfDecoder};
pub use surface::spawn_surface;
