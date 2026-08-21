//! 设备命令：扫描转发。选择会话在壳，本层只维护目录快照。

use tauri::State;

use crate::commands::ipc;
use crate::state::AppState;
use yohu_protocol::{DeviceInfo, IpcError};

/// `device.refresh`：立即 `devices -l` 扫描。
#[tauri::command(rename = "device.refresh")]
pub async fn device_refresh(state: State<'_, AppState>) -> Result<Vec<DeviceInfo>, IpcError> {
    crate::device_catalog::refresh(&state).await.map_err(ipc)
}
