//! yohu-domain — 纯领域层。
//!
//! **高内聚边界**：本 crate 只含业务规则，不含进程/文件/网络 IO。
//! ADB 执行能力经 [`command::Runner`] 端口注入（由 yohu-adb 实现）。
//! 依赖方向：yohu-domain → yohu-protocol（禁止反向）。

pub mod applog;
pub mod command;
pub mod focus;
pub mod log_filter;
pub mod safety;
pub mod settings;

pub use applog::{AppLog, AppLogEntry, LogLevel};
pub use command::{
    default_library, run_and_evaluate, split_command_line, CommandDefinition, CommandEvaluator,
    CommandGroup, CommandLibrary, EvaluatedRun, GroupExecutor, GroupRunEvent, InputField,
    LibraryError, RunError, Runner, Verdict,
};
pub use focus::{
    assert_device_online, assert_targets_online, catalog_after_scan, device_display_name,
    lookup_selected_devices, reconcile_focus, DeviceSessionError, SelectionMode,
};
pub use log_filter::{level_rank, log_filter_matches};
pub use safety::{validate_entry_name, PathError, RemotePath, SafetyError, SafetyRoot};
pub use settings::apply_setting;
