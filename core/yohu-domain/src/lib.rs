//! yohu-domain — 纯领域层。
//!
//! **高内聚边界**：本 crate 只含业务规则，不含进程/文件/网络 IO。
//! ADB 执行能力经 [`command::Runner`] 端口注入（由 yohu-adb 实现）。
//! 依赖方向：yohu-domain → yohu-protocol（禁止反向）。

pub mod applog;
pub mod command;
pub mod focus;
pub mod safety;

pub use applog::{AppLog, AppLogEntry, LogLevel};
pub use command::{
    CommandDefinition, CommandEvaluator, CommandGroup, CommandLibrary, GroupExecutor,
    GroupRunEvent, InputField, LibraryError, RunError, Runner, Verdict, default_library,
    split_command_line,
};
pub use focus::{DeviceFocus, SelectionMode};
pub use safety::{PathError, RemotePath, SafetyError, SafetyRoot, validate_entry_name};
