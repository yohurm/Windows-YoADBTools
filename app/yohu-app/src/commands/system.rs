//! 系统命令：信息/打开路径/错误上报。

use crate::commands::err_internal;
use crate::state::AppState;
#[cfg(not(windows))]
use yohu_protocol::ErrorCode;
use yohu_protocol::{AppIdentity, AppError, SystemInfo};

/// `system.info`：关于/诊断信息。
pub fn system_info(state: &AppState) -> Result<SystemInfo, AppError> {
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

/// `system.openPath`：用资源管理器打开目录，或选中文件。
pub fn system_open_path(path: String) -> Result<(), AppError> {
    #[cfg(windows)]
    {
        let target = std::path::Path::new(&path);
        let mut cmd = std::process::Command::new("explorer");
        if target.is_file() {
            cmd.arg(format!("/select,{path}"));
        } else {
            cmd.arg(&path);
        }
        cmd.spawn().map_err(err_internal)?;
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        return Err(AppError {
            code: ErrorCode::Internal,
            message: "仅支持 Windows".into(),
        });
    }
    Ok(())
}

/// `system.reportError`：UI 全局错误上报（应用操作日志）。
pub fn system_report_error(state: &AppState, message: String) {
    state.app_log.error(message);
}
