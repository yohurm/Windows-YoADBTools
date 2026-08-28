//! yohu-runtime — 宿主运行时（与 `yohu-protocol` 并列，互不依赖）。
//!
//! 只含跨 capability 的本机能力：子进程、原子写、OS 应用数据根。
//! 禁止产品 wire 类型、设备路径、HTTP、Tauri。

pub mod os_paths;
pub mod persist;
pub mod process;

pub use os_paths::{app_data_root, open_path};
pub use persist::{atomic_write, backup_corrupt};
pub use process::{kill_tree, ChildHandle, ProcessError, ProcessOutput, ProcessRunner};
