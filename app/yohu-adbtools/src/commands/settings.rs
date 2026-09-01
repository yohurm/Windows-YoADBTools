//! 设置命令：get/set（含立即生效语义）。

use std::path::PathBuf;

use tauri::State;

use crate::commands::ipc_code;
use crate::state::AppState;
use yohu_protocol::{AppEvent, AppSettings, IpcError, IpcErrorCode, SettingKey};

/// `settings.get`：单键值。
#[tauri::command(rename = "settings.get")]
pub fn settings_get(state: State<'_, AppState>, key: SettingKey) -> serde_json::Value {
    let s = state.settings.snapshot();
    match key {
        SettingKey::AdbPath => serde_json::json!(s.adb_path),
        SettingKey::DataRoot => serde_json::json!(s.data_root),
        SettingKey::DevicesAutoRefresh => serde_json::json!(s.devices_auto_refresh),
        SettingKey::BufferCapacity => serde_json::json!(s.buffer_capacity),
        SettingKey::ClearDeviceOnStart => serde_json::json!(s.clear_device_on_start),
        SettingKey::Theme => serde_json::json!(s.theme),
        SettingKey::Density => serde_json::json!(s.density),
        SettingKey::ExportDefaultPath => serde_json::json!(s.export_default_path),
        SettingKey::ExportAskEveryTime => serde_json::json!(s.export_ask_every_time),
        SettingKey::ExportMode => serde_json::json!(s.export_mode),
        SettingKey::LogWriteMode => serde_json::json!(s.log_write_mode),
        SettingKey::LogDisplayColumns => serde_json::json!(s.log_display_columns),
        SettingKey::MirrorMaxSize => serde_json::json!(s.mirror_max_size),
        SettingKey::MirrorVideoBitRate => serde_json::json!(s.mirror_video_bit_rate),
        SettingKey::MirrorMaxFps => serde_json::json!(s.mirror_max_fps),
        SettingKey::MirrorForceForward => serde_json::json!(s.mirror_force_forward),
    }
}

/// `settings.set`：更新单键并落盘；返回全量快照。
/// `settings.changed` 是控制面（无环可重放），`send().await` 必达，禁止 try_send。
#[tauri::command(rename = "settings.set")]
pub async fn settings_set(
    state: State<'_, AppState>,
    key: SettingKey,
    value: serde_json::Value,
) -> Result<AppSettings, IpcError> {
    let updated = state
        .settings
        .set(key, &value)
        .map_err(|e| ipc_code(IpcErrorCode::InvalidArgs, e))?;

    if key == SettingKey::BufferCapacity {
        state.capture.set_ring_capacity(updated.buffer_capacity);
    }

    // 立即生效项
    if key == SettingKey::AdbPath {
        let path = (!updated.adb_path.is_empty()).then(|| PathBuf::from(&updated.adb_path));
        state.client.set_user_path(path);
        state.app_log.info(if updated.adb_path.is_empty() {
            "ADB 路径已重置为自动解析".to_string()
        } else {
            format!("ADB 路径已切换: {}", updated.adb_path)
        });
    }

    let _ = state
        .event_tx
        .send(AppEvent::SettingsChanged {
            key: key.as_str().to_string(),
            settings: updated.clone(),
        })
        .await;
    Ok(updated)
}
