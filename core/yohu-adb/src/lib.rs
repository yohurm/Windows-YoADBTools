//! yohu-adb — ADB 客户端（设备运输层）。
//!
//! 包装官方 adb.exe（ADR-v6-008：不重实现协议）。
//! 进程生命周期在 `yohu-runtime`；本 crate 做 adb 语义、解析与 `Runner` 适配。

pub mod client;
pub mod error;
pub mod parse;
pub mod shell;
pub mod tool;

pub use client::AdbClient;
pub use error::AdbError;
pub use yohu_runtime::ChildHandle;
pub use shell::shell_quote;
pub use tool::ToolResolver;
