//! 设备命令：扫描转发。选择会话在壳，本层只维护目录快照。

use crate::commands::err_internal;
use crate::state::AppState;
use yohu_protocol::{DeviceInfo, AppError};

/// `device.refresh`：立即 `devices -l` 扫描。
pub async fn device_refresh(state: &AppState) -> Result<Vec<DeviceInfo>, AppError> {
    crate::device_catalog::refresh(state).await.map_err(err_internal)
}
