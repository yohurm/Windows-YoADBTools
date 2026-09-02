//! 设备命令：目录读/写。选择会话在壳，本层只维护扫描快照。

use tauri::State;

use crate::commands::ipc;
use crate::state::AppState;
use yohu_protocol::{DeviceInfo, IpcError};

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
