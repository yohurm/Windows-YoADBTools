//! yohu-adb — ADB 客户端（进程与解析层）。
//!
//! 包装官方 adb.exe（ADR-v6-008：不重实现协议）。
//! 依赖方向：yohu-adb → yohu-domain → yohu-protocol。

pub mod client;
pub mod error;
pub mod parse;
pub mod process;
pub mod shell;
pub mod tool;

pub use client::AdbClient;
pub use error::AdbError;
pub use process::{kill_tree, ProcessRunner};
pub use shell::shell_quote;
pub use tool::ToolResolver;
