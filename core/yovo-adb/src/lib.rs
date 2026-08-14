//! yovo-adb — ADB 客户端（进程与解析层）。
//!
//! 包装官方 adb.exe（ADR-v6-008：不重实现协议）。
//! 依赖方向：yovo-adb → yovo-domain → yovo-protocol。

pub mod client;
pub mod error;
pub mod parse;
pub mod process;
pub mod tool;

pub use client::AdbClient;
pub use error::AdbError;
pub use process::ProcessRunner;
pub use tool::ToolResolver;
