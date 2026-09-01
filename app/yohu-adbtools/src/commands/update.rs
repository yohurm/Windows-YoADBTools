//! 应用更新：检查 / 下载 / 覆盖安装 / 打开浏览器兜底。

use tauri::{AppHandle, State};

use crate::commands::{ipc, ipc_update};
use crate::state::AppState;
use tokio_util::sync::CancellationToken;
use yohu_protocol::{
    AppEvent, AppIdentity, IpcError, RemoteUpdate, UpdateChannelInfo, UpdateDownloadRequest,
    UpdateDownloadResult, PRODUCT_NAME,
};
use yohu_update::{
    assert_cached_installer, assert_http_url, check_configured, describe_channel,
    download_installer, installed_exe_path, load_github_source, spawn_overlay_install,
    PlatformInfo,
};

/// `update.check`：用本机平台身份查询是否有新版本（默认 GitHub Releases）。
#[tauri::command(rename = "update.check")]
pub async fn update_check(state: State<'_, AppState>) -> Result<RemoteUpdate, IpcError> {
    let platform =
        PlatformInfo::from_identity(&AppIdentity::with_version(env!("CARGO_PKG_VERSION")));
    check_configured(&state.paths.settings_dir, platform)
        .await
        .map_err(ipc_update)
}

/// `update.info`：当前通道（不含密钥），供设置页展示。
#[tauri::command(rename = "update.info")]
pub fn update_info(state: State<'_, AppState>) -> Result<UpdateChannelInfo, IpcError> {
    describe_channel(&state.paths.settings_dir).map_err(ipc_update)
}

/// `update.download`：把检查结果中的安装包下到临时目录并校验。
#[tauri::command(rename = "update.download")]
pub async fn update_download(
    state: State<'_, AppState>,
    request: UpdateDownloadRequest,
) -> Result<UpdateDownloadResult, IpcError> {
    let url = assert_http_url(&request.url)
        .map_err(ipc_update)?
        .to_string();
    let token = load_github_source(&state.paths.settings_dir)
        .map(|s| s.token)
        .unwrap_or_default();
    let cancel = CancellationToken::new();
    {
        let mut slot = state
            .update_download_cancel
            .lock()
            .expect("update cancel lock poisoned");
        if let Some(prev) = slot.take() {
            prev.cancel();
        }
        *slot = Some(cancel.clone());
    }
    let task_id = state.tasks.register(
        "下载更新".into(),
        if request.version.is_empty() {
            "安装包".into()
        } else {
            format!("v{}", request.version.trim_start_matches(['v', 'V']))
        },
    );
    let version = request.version.clone();
    let event_tx = state.event_tx.clone();
    let user_agent = format!("{PRODUCT_NAME}/{}", env!("CARGO_PKG_VERSION"));
    let result = download_installer(
        &url,
        &request.sha256,
        request.size_bytes,
        &token,
        &user_agent,
        cancel.clone(),
        move |mut progress| {
            if progress.version.is_empty() {
                progress.version = version.clone();
            }
            let _ = event_tx.try_send(AppEvent::UpdateProgress(progress));
        },
    )
    .await;
    {
        let mut slot = state
            .update_download_cancel
            .lock()
            .expect("update cancel lock poisoned");
        if slot.as_ref().is_some_and(|c| c == &cancel) {
            *slot = None;
        }
    }
    state.tasks.finish(task_id);
    result.map_err(ipc_update)
}

/// `update.install`：拉起脱离作业的覆盖安装助手后退出当前进程。
#[tauri::command(rename = "update.install")]
pub fn update_install(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), IpcError> {
    let installer = assert_cached_installer(std::path::Path::new(&path)).map_err(ipc_update)?;
    let relaunch = installed_exe_path();
    let pid = std::process::id();
    let _ = state
        .event_tx
        .try_send(AppEvent::UpdateProgress(yohu_protocol::UpdateProgress {
            version: String::new(),
            stage: yohu_protocol::UpdateStage::Applying,
            received_bytes: 0,
            total_bytes: 0,
        }));
    spawn_overlay_install(&installer, pid, &relaunch).map_err(ipc_update)?;
    state.app_log.info("已启动覆盖安装，即将退出以便写入主程序");
    state.root_cancel.cancel();
    if let Err(e) = state.settings.save_atomic() {
        tracing::warn!("覆盖安装前保存设置失败: {e}");
    }
    app.exit(0);
    Ok(())
}

/// `update.cancel`：取消进行中的安装包下载。
#[tauri::command(rename = "update.cancel")]
pub fn update_cancel(state: State<'_, AppState>) -> Result<(), IpcError> {
    if let Some(cancel) = state
        .update_download_cancel
        .lock()
        .expect("update cancel lock poisoned")
        .take()
    {
        cancel.cancel();
    }
    Ok(())
}

/// `update.open`：打开检查结果中的 http(s) 下载地址（浏览器兜底）。
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
