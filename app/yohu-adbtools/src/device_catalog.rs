//! 设备目录：最近一次成功的 `adb devices -l` 就是唯一存在性快照。
//! 扫描失败不改目录；扫描成功（含空列表）整表替换。离开 Online 的 serial 收敛采集/投屏/状态 Hub。

use tokio_util::sync::CancellationToken;

use crate::state::AppState;
use yohu_domain::{catalog_after_scan, start_force_forward};
use yohu_protocol::{AppEvent, DeviceInfo, DeviceState};

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
        state.mirror.drop_warm(serial).await;
        state.finish_capture_task(serial);
        let _ = state
            .event_tx
            .send(AppEvent::DeviceOffline {
                serial: serial.clone(),
            })
            .await;
    }

    let settings = state.settings.snapshot();
    let online: Vec<String> = devices
        .iter()
        .filter(|d| d.state == DeviceState::Online)
        .map(|d| d.serial.clone())
        .collect();
    state.status.sync_online(&online);
    for device in &devices {
        if device.state == DeviceState::Online {
            let serial = device.serial.clone();
            let force = start_force_forward(&settings, &device.connection);
            let mirror = std::sync::Arc::clone(&state.mirror);
            tokio::spawn(async move {
                mirror.warmup(&serial, force).await;
            });
        }
    }

    // 目录变更是控制面（无环可重放），与 settings/changed 一样 send().await，禁止 try_send。
    if let Err(e) = state
        .event_tx
        .send(AppEvent::DevicesChanged {
            devices: devices.clone(),
        })
        .await
    {
        tracing::warn!("devices/changed 发送失败: {e}");
    }
    Ok(devices)
}
