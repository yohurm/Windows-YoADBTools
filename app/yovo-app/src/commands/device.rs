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
/// 自愈：逐候选尝试 adb；记录实际使用的路径供诊断（system.info / UI 提示）。
pub(crate) async fn refresh_inner(state: &AppState) -> Result<Vec<DeviceInfo>, String> {
    let (devices, adb_used) = state
        .client
        .devices_resilient(CancellationToken::new())
        .await
        .map_err(|e| e.to_string())?;
    *state.adb_in_use.lock().expect("adb_in_use lock poisoned") =
        Some(adb_used.to_string_lossy().into_owned());
    tracing::info!("设备扫描成功（adb: {}），设备 {} 台", adb_used.display(), devices.len());

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
