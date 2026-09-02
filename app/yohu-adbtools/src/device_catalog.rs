//! 设备目录：最近一次成功的 `adb devices -l` 就是唯一快照。
//! 扫描失败不改目录；扫描成功（含空列表）整表替换。commands 只转发。

use tokio_util::sync::CancellationToken;

use crate::state::AppState;
use yohu_domain::catalog_after_scan;
use yohu_protocol::{AppEvent, DeviceInfo};

/// 读目录快照，不触发扫描。
pub fn snapshot(state: &AppState) -> Vec<DeviceInfo> {
    state
        .last_devices
        .lock()
        .expect("devices lock poisoned")
        .clone()
}

/// 立即 `devices -l`，用本次解析结果整表替换目录。
pub async fn refresh(state: &AppState) -> Result<Vec<DeviceInfo>, String> {
    let (scanned, adb_used) = state
        .client
        .devices_resilient(CancellationToken::new())
        .await
        .map_err(|e| e.to_string())?;
    let previous = snapshot(state);
    let (devices, went_offline) = catalog_after_scan(&previous, scanned);

    *state.adb_in_use.lock().expect("adb_in_use lock poisoned") =
        Some(adb_used.to_string_lossy().into_owned());
    tracing::info!(
        "设备扫描成功（adb: {}），设备 {} 台",
        adb_used.display(),
        devices.len()
    );

    {
        let mut cache = state.last_devices.lock().expect("devices lock poisoned");
        *cache = devices.clone();
    }

    for serial in &went_offline {
        tracing::info!("设备掉线: {}", serial);
        state.capture.detach_device(serial).await;
        state.mirror.stop(serial).await;
        state.finish_capture_task(serial);
        state.finish_mirror_task(serial);
        let _ = state
            .event_tx
            .send(AppEvent::DeviceOffline {
                serial: serial.clone(),
            })
            .await;
    }

    let _ = state.event_tx.try_send(AppEvent::DevicesChanged {
        devices: devices.clone(),
    });
    Ok(devices)
}
