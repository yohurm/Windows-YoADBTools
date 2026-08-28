//! 应用更新：检查 / 打开下载地址 / 通道摘要。

use tauri::State;

use crate::commands::{ipc, ipc_update};
use crate::state::AppState;
use yohu_protocol::{AppIdentity, IpcError, RemoteUpdate, UpdateChannelInfo};
use yohu_update::{assert_http_url, check_configured, describe_channel, PlatformInfo};

/// `update.check`：用本机平台身份查询是否有新版本（默认 GitHub Releases）。
#[tauri::command(rename = "update.check")]
pub async fn update_check(state: State<'_, AppState>) -> Result<RemoteUpdate, IpcError> {
    let platform =
        PlatformInfo::from_identity(&AppIdentity::with_version(env!("CARGO_PKG_VERSION")));
    let provider = state.settings.snapshot().update_provider;
    check_configured(&state.paths.settings_dir, provider, platform)
        .await
        .map_err(ipc_update)
}

/// `update.info`：当前通道（不含密钥），供设置页展示。
#[tauri::command(rename = "update.info")]
pub fn update_info(state: State<'_, AppState>) -> Result<UpdateChannelInfo, IpcError> {
    let provider = state.settings.snapshot().update_provider;
    describe_channel(&state.paths.settings_dir, provider).map_err(ipc_update)
}

/// `update.open`：打开检查结果中的 http(s) 下载地址。
#[tauri::command(rename = "update.open")]
pub fn update_open(url: String) -> Result<(), IpcError> {
    let url = assert_http_url(&url).map_err(ipc_update)?;
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(ipc)?;
    }
    #[cfg(not(windows))]
    {
        let _ = url;
        return Err(crate::commands::ipc_code(
            yohu_protocol::IpcErrorCode::Internal,
            "仅支持 Windows",
        ));
    }
    Ok(())
}
