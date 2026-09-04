//! 系统命令：信息/打开路径/错误上报。

use tauri::State;

use crate::commands::ipc;
use crate::state::AppState;
use yohu_protocol::{AppIdentity, IpcError, SystemInfo};
use yohu_runtime::open_path;

/// `system.info`：关于/诊断信息。
#[tauri::command(rename = "system.info")]
pub fn system_info(state: State<'_, AppState>) -> Result<SystemInfo, IpcError> {
    let adb_path = state
        .tool
        .resolve()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    let adb_in_use = state
        .adb_in_use
        .lock()
        .expect("adb_in_use lock poisoned")
        .clone();
    Ok(SystemInfo {
        identity: AppIdentity::with_version(env!("CARGO_PKG_VERSION")),
        paths: state.paths.catalog(),
        adb_path,
        adb_in_use,
        settings: state.settings.snapshot(),
    })
}

/// `system.openPath`：用系统文件管理器打开目录，或选中文件。
#[tauri::command(rename = "system.openPath")]
pub fn system_open_path(path: String) -> Result<(), IpcError> {
    open_path(std::path::Path::new(&path)).map_err(ipc)
}

/// `system.reportError`：前端全局错误上报（应用操作日志）。
#[tauri::command(rename = "system.reportError")]
pub fn system_report_error(state: State<'_, AppState>, message: String) {
    crate::yolog::write(&state.app_log, yohu_domain::LogLevel::Error, "ui", &message);
}

/// `system.log`：YoLog 落盘（控制台已由前端打印）。
#[tauri::command(rename = "system.log")]
pub fn system_log(state: State<'_, AppState>, level: String, module: String, message: String) {
    crate::yolog::write(
        &state.app_log,
        crate::yolog::parse_level(&level),
        &module,
        &message,
    );
}
