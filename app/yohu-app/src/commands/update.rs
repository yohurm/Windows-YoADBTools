//! 应用更新：检查 / 打开下载地址 / 通道摘要。

use crate::commands::{err_internal, err_update};
use crate::state::AppState;
use yohu_protocol::{AppIdentity, AppError, RemoteUpdate, UpdateChannelInfo};
use yohu_update::{assert_http_url, check_configured, describe_channel, PlatformInfo};

/// `update.check`：用本机平台身份查询是否有新版本（默认 GitCode Releases）。
pub async fn update_check(state: &AppState) -> Result<RemoteUpdate, AppError> {
    let platform =
        PlatformInfo::from_identity(&AppIdentity::with_version(env!("CARGO_PKG_VERSION")));
    let provider = state.settings.snapshot().update_provider;
    check_configured(&state.paths.settings_dir, provider, platform)
        .await
        .map_err(err_update)
}

/// `update.info`：当前通道（不含密钥），供设置页展示。
pub fn update_info(state: &AppState) -> Result<UpdateChannelInfo, AppError> {
    let provider = state.settings.snapshot().update_provider;
    describe_channel(&state.paths.settings_dir, provider).map_err(err_update)
}

/// `update.open`：打开检查结果中的 http(s) 下载地址。
pub fn update_open(url: String) -> Result<(), AppError> {
    let url = assert_http_url(&url).map_err(err_update)?;
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(err_internal)?;
    }
    #[cfg(not(windows))]
    {
        let _ = url;
        return Err(crate::commands::err_code(
            yohu_protocol::ErrorCode::Internal,
            "仅支持 Windows",
        ));
    }
    Ok(())
}
