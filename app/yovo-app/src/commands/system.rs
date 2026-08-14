//! 系统命令：信息/打开路径/错误上报。

use tauri::State;

use crate::commands::ipc;
use crate::state::AppState;
use yovo_protocol::{AppSettings, IpcError};
#[cfg(not(windows))]
use yovo_protocol::IpcErrorCode;

/// `system.info`：关于/诊断信息。
#[derive(serde::Serialize)]
pub struct SystemInfo {
    pub version: String,
    pub data_root: String,
    pub adb_path: String,
    pub settings: AppSettings,
}

#[tauri::command]
pub fn system_info(state: State<'_, AppState>) -> Result<SystemInfo, IpcError> {
    let adb_path = state
        .tool
        .resolve()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    Ok(SystemInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        data_root: state.paths.data_root.to_string_lossy().into_owned(),
        adb_path,
        settings: state.settings.snapshot(),
    })
}

/// `system.openPath`：用资源管理器打开路径（导出的 txt 等）。
#[tauri::command]
pub fn system_open_path(path: String) -> Result<(), IpcError> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(ipc)?;
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        return Err(IpcError { code: IpcErrorCode::Internal, message: "仅支持 Windows".into() });
    }
    Ok(())
}

/// `system.reportError`：前端全局错误上报（应用操作日志）。
#[tauri::command]
pub fn system_report_error(state: State<'_, AppState>, message: String) {
    state.app_log.error(message);
}
