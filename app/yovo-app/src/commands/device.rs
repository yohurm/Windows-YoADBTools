//! 设备命令：扫描/列表/焦点收敛/掉线停采。

use tauri::State;
use tokio_util::sync::CancellationToken;

use crate::commands::ipc;
use crate::state::AppState;
use yovo_protocol::{AppEvent, DeviceInfo, DeviceState, IpcError};

/// `device.list`：最近一次扫描快照（不触发扫描）。
#[tauri::command]
pub fn device_list(state: State<'_, AppState>) -> Vec<DeviceInfo> {
    state.last_devices.lock().expect("devices lock poisoned").clone()
}

/// `device.refresh`：立即 `devices -l` 扫描。
#[tauri::command]
pub async fn device_refresh(state: State<'_, AppState>) -> Result<Vec<DeviceInfo>, IpcError> {
    refresh_inner(&state).await.map_err(ipc)
}

/// 扫描核心逻辑（启动预热与命令共用）。
pub(crate) async fn refresh_inner(state: &AppState) -> Result<Vec<DeviceInfo>, String> {
    let devices = state
        .client
        .devices(CancellationToken::new())
        .await
        .map_err(|e| e.to_string())?;

    let serials: Vec<String> = devices.iter().map(|d| d.serial.clone()).collect();

    // 缓存更新 + 焦点收敛
    let previous = {
        let mut cache = state.last_devices.lock().expect("devices lock poisoned");
        std::mem::replace(&mut *cache, devices.clone())
    };
    state.focus.lock().expect("focus lock poisoned").resolve_against(&serials);

    // 掉线检测：上一批在线、本批缺失 → 事件 + 停采清缓冲（防串设备）
    for old in &previous {
        if old.state == DeviceState::Online && !serials.contains(&old.serial) {
            tracing::info!("设备掉线: {}", old.serial);
            crate::commands::log::cancel_index(state, &old.serial);
            let _ = state.event_tx.try_send(AppEvent::DeviceOffline { serial: old.serial.clone() });
            state.capture.detach_device(&old.serial).await;
        }
    }

    let _ = state.event_tx.try_send(AppEvent::DevicesChanged { devices: devices.clone() });
    Ok(devices)
}
