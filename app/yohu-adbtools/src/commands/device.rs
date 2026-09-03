//! 设备命令：目录读/写 + 运行时状态快照。选择会话在壳，本层只转发 core。

use tauri::State;
use tokio_util::sync::CancellationToken;

use crate::commands::{ipc, ipc_adb};
use crate::state::AppState;
use yohu_protocol::{DeviceInfo, DeviceStatus, IpcError};

/// `device.list`：读最近一次成功扫描的目录，不跑 adb。
#[tauri::command(rename = "device.list")]
pub fn device_list(state: State<'_, AppState>) -> Result<Vec<DeviceInfo>, IpcError> {
    Ok(crate::device_catalog::snapshot(&state))
}

/// `device.refresh`：立即 `devices -l` 扫描并推 `devices/changed`。
#[tauri::command(rename = "device.refresh")]
pub async fn device_refresh(state: State<'_, AppState>) -> Result<Vec<DeviceInfo>, IpcError> {
    crate::device_catalog::refresh(&state).await.map_err(ipc)
}

/// `device.status`：读运行时状态缓存（不触发扫描）。`serial` 缺省则返回全部在线设备。
#[tauri::command(rename = "device.status")]
pub fn device_status(
    state: State<'_, AppState>,
    serial: Option<String>,
) -> Result<Vec<DeviceStatus>, IpcError> {
    match serial {
        Some(s) if !s.is_empty() => Ok(state.status.snapshot(&s).into_iter().collect()),
        _ => Ok(state.status.snapshot_all()),
    }
}

/// `device.setNightMode`：切换连接设备深浅色，返回更新后的运行时快照。
#[tauri::command(rename = "device.setNightMode")]
pub async fn device_set_night_mode(
    state: State<'_, AppState>,
    serial: String,
    night: bool,
) -> Result<DeviceStatus, IpcError> {
    state.require_online(&serial)?;
    state
        .status
        .set_night(&serial, night, CancellationToken::new())
        .await
        .map_err(ipc_adb)
}
