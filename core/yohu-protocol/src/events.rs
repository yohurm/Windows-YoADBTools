//! 事件模型（core → UI）与事件名常量。
//!
//! 事件经 Tauri `emit` 推送；负载为 [`AppEvent`]（serde 内部 tag `kind`，camelCase）。
//! 事件名常量见 [`event_names`]，前端 `@yohu/api` 按同样常量 `listen`。

use serde::{Deserialize, Serialize};

use crate::{
    AppSettings, CaptureState, DeviceInfo, LogBatch, MirrorPacket, MirrorSessionState,
    ProcessIndexSnapshot, TransferProgress,
};

/// 后台任务登记信息（状态栏）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TaskInfo {
    pub id: u32,
    pub name: String,
    #[serde(rename = "active")]
    pub active: bool,
    /// 悬停明细（如「3 台设备 · 5 条命令」；状态栏 title 提示）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

/// 命令组进度（每命令完成一条）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GroupProgress {
    pub run_id: u32,
    pub serial: String,
    /// 命令名（展示用）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// 单命令用时（毫秒；结果卡片头部展示）
    pub duration_ms: u64,
}

/// 统一事件负载。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AppEvent {
    DevicesChanged {
        devices: Vec<DeviceInfo>,
    },
    DeviceOffline {
        serial: String,
    },
    LogBatch(LogBatchPayload),
    LogOverflow {
        serial: String,
        dropped_batches: u64,
    },
    ProcessIndex(ProcessIndexSnapshot),
    CaptureState {
        serial: String,
        generation: u64,
        state: CaptureState,
    },
    TransferProgress(TransferProgress),
    GroupProgress(GroupProgress),
    TaskSummary {
        tasks: Vec<TaskInfo>,
    },
    SettingsChanged {
        key: String,
        /// 变更后的全量快照（模块投影用，禁止再 `settings.get`）。
        settings: AppSettings,
    },
    MirrorState {
        serial: String,
        generation: u64,
        state: MirrorSessionState,
        width: u32,
        height: u32,
        codec: String,
        control: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    MirrorPacket(MirrorPacket),
}

/// `LogBatch` 包装（内部 tag 枚举需要 struct 变体承载）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LogBatchPayload {
    pub batch: LogBatch,
}

/// 事件名常量（emit / listen 共用，禁止散落字符串字面量）。
///
/// Tauri 2.9+ 事件名只允许字母数字和 `-` `/` `:` `_`，**禁止点号**。
pub mod event_names {
    pub const DEVICES_CHANGED: &str = "devices/changed";
    pub const DEVICE_OFFLINE: &str = "device/offline";
    pub const LOG_LINES: &str = "log/lines";
    pub const LOG_OVERFLOW: &str = "log/overflow";
    pub const PROCESS_INDEX: &str = "log/processIndex";
    pub const CAPTURE_STATE: &str = "log/captureState";
    pub const TRANSFER_PROGRESS: &str = "transfer/progress";
    pub const GROUP_PROGRESS: &str = "group/progress";
    pub const TASK_SUMMARY: &str = "task/summary";
    pub const SETTINGS_CHANGED: &str = "settings/changed";
    pub const MIRROR_STATE: &str = "mirror/state";
    pub const MIRROR_PACKET: &str = "mirror/packet";
}

impl AppEvent {
    /// 事件负载对应的 Tauri 事件名。
    pub fn name(&self) -> &'static str {
        use event_names::*;
        match self {
            AppEvent::DevicesChanged { .. } => DEVICES_CHANGED,
            AppEvent::DeviceOffline { .. } => DEVICE_OFFLINE,
            AppEvent::LogBatch(_) => LOG_LINES,
            AppEvent::LogOverflow { .. } => LOG_OVERFLOW,
            AppEvent::ProcessIndex(_) => PROCESS_INDEX,
            AppEvent::CaptureState { .. } => CAPTURE_STATE,
            AppEvent::TransferProgress(_) => TRANSFER_PROGRESS,
            AppEvent::GroupProgress(_) => GROUP_PROGRESS,
            AppEvent::TaskSummary { .. } => TASK_SUMMARY,
            AppEvent::SettingsChanged { .. } => SETTINGS_CHANGED,
            AppEvent::MirrorState { .. } => MIRROR_STATE,
            AppEvent::MirrorPacket(_) => MIRROR_PACKET,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{AppSettings, CaptureState, LogBatch};

    #[test]
    fn log_batch_event_json_has_kind_and_batch() {
        let event = AppEvent::LogBatch(LogBatchPayload {
            batch: LogBatch {
                serial: "s1".into(),
                from_seq: 1,
                lines: vec![],
                truncated: false,
            },
        });
        let v = serde_json::to_value(&event).expect("serialize");
        assert_eq!(v["kind"], "logBatch");
        assert_eq!(v["batch"]["serial"], "s1");
        assert_eq!(v["batch"]["from_seq"], 1);
    }

    #[test]
    fn capture_state_event_includes_generation() {
        let event = AppEvent::CaptureState {
            serial: "s1".into(),
            generation: 3,
            state: CaptureState::Running,
        };
        let v = serde_json::to_value(&event).expect("serialize");
        assert_eq!(v["kind"], "captureState");
        assert_eq!(v["serial"], "s1");
        assert_eq!(v["generation"], 3);
        assert_eq!(v["state"], "running");
    }

    #[test]
    fn settings_changed_event_carries_snapshot() {
        let event = AppEvent::SettingsChanged {
            key: "buffer_capacity".into(),
            settings: AppSettings::default(),
        };
        let v = serde_json::to_value(&event).expect("serialize");
        assert_eq!(v["kind"], "settingsChanged");
        assert_eq!(v["key"], "buffer_capacity");
        assert_eq!(v["settings"]["buffer_capacity"], 10_000);
    }

    #[test]
    fn mirror_state_event_lowercase_and_generation() {
        let event = AppEvent::MirrorState {
            serial: "s1".into(),
            generation: 2,
            state: crate::MirrorSessionState::Live,
            width: 1080,
            height: 1920,
            codec: "h264".into(),
            control: false,
            error: None,
        };
        let v = serde_json::to_value(&event).expect("serialize");
        assert_eq!(v["kind"], "mirrorState");
        assert_eq!(v["serial"], "s1");
        assert_eq!(v["generation"], 2);
        assert_eq!(v["state"], "live");
        assert_eq!(v["codec"], "h264");
        assert_eq!(event.name(), event_names::MIRROR_STATE);
    }

    #[test]
    fn mirror_packet_event_flattens_fields() {
        let event = AppEvent::MirrorPacket(crate::MirrorPacket {
            serial: "s1".into(),
            generation: 1,
            codec: "h264".into(),
            width: 8,
            height: 8,
            config: true,
            keyframe: false,
            pts: 0,
            data_b64: "Zg==".into(),
        });
        let v = serde_json::to_value(&event).expect("serialize");
        assert_eq!(v["kind"], "mirrorPacket");
        assert_eq!(v["serial"], "s1");
        assert_eq!(v["data_b64"], "Zg==");
        assert_eq!(event.name(), event_names::MIRROR_PACKET);
    }

    #[test]
    fn event_names_are_tauri_safe() {
        for name in [
            event_names::DEVICES_CHANGED,
            event_names::DEVICE_OFFLINE,
            event_names::LOG_LINES,
            event_names::LOG_OVERFLOW,
            event_names::PROCESS_INDEX,
            event_names::CAPTURE_STATE,
            event_names::TRANSFER_PROGRESS,
            event_names::GROUP_PROGRESS,
            event_names::TASK_SUMMARY,
            event_names::SETTINGS_CHANGED,
            event_names::MIRROR_STATE,
            event_names::MIRROR_PACKET,
        ] {
            assert!(
                name.chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '/' | ':' | '_')),
                "Tauri 2.9 禁止点号事件名: {name}"
            );
        }
    }
}
