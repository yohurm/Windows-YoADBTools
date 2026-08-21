//! 设备目录：扫描、缓存、掉线停采。commands 只转发本服务。

use tokio_util::sync::CancellationToken;

use crate::state::AppState;
use yohu_protocol::{AppEvent, DeviceInfo, DeviceState};

/// 立即 `devices -l`。自愈：逐候选尝试 adb；记录实际路径供 system.info。
pub async fn refresh(state: &AppState) -> Result<Vec<DeviceInfo>, String> {
    let (devices, adb_used) = state
        .client
        .devices_resilient(CancellationToken::new())
        .await
        .map_err(|e| e.to_string())?;
    *state.adb_in_use.lock().expect("adb_in_use lock poisoned") =
        Some(adb_used.to_string_lossy().into_owned());
    tracing::info!(
        "设备扫描成功（adb: {}），设备 {} 台",
        adb_used.display(),
        devices.len()
    );

    let serials: Vec<String> = devices.iter().map(|d| d.serial.clone()).collect();

    let previous = {
        let mut cache = state.last_devices.lock().expect("devices lock poisoned");
        std::mem::replace(&mut *cache, devices.clone())
    };

    for old in &previous {
        if old.state == DeviceState::Online && !serials.contains(&old.serial) {
            tracing::info!("设备掉线: {}", old.serial);
            state.capture.detach_device(&old.serial).await;
            state.finish_capture_task(&old.serial);
            let _ = state
                .event_tx
                .send(AppEvent::DeviceOffline {
                    serial: old.serial.clone(),
                })
                .await;
        }
    }

    let _ = state.event_tx.try_send(AppEvent::DevicesChanged {
        devices: devices.clone(),
    });
    Ok(devices)
}
