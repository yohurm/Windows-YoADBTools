//! 设置命令：set（全量快照事件）；读走 `system.info` / `settings/changed`，无单键 get。

use std::path::PathBuf;

use tauri::State;

use crate::commands::ipc_code;
use crate::state::AppState;
use yohu_protocol::{AppEvent, AppSettings, IpcError, IpcErrorCode, SettingKey};

/// `settings.set`：更新单键并落盘；返回全量快照。
/// `settings/changed` 是控制面（无环可重放），`send().await` 必达，禁止 try_send。
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
