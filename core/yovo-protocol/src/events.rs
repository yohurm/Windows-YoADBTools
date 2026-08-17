//! 事件模型（core → UI）与事件名常量。
//!
//! 事件经 Tauri `emit` 推送；负载为 [`AppEvent`]（serde 内部 tag `kind`，camelCase）。
//! 事件名常量见 [`event_names`]，前端 `@yovo/api` 按同样常量 `listen`。

use serde::{Deserialize, Serialize};

use crate::{CaptureState, DeviceInfo, LogBatch, ProcessIndexSnapshot, TransferProgress};

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
        state: CaptureState,
    },
    TransferProgress(TransferProgress),
    GroupProgress(GroupProgress),
    TaskSummary {
        tasks: Vec<TaskInfo>,
    },
    SettingsChanged {
        key: String,
    },
}

/// `LogBatch` 包装（内部 tag 枚举需要 struct 变体承载）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LogBatchPayload {
    pub batch: LogBatch,
}

/// 事件名常量（emit / listen 共用，禁止散落字符串字面量）。
pub mod event_names {
    pub const DEVICES_CHANGED: &str = "devices.changed";
    pub const DEVICE_OFFLINE: &str = "device.offline";
    pub const LOG_LINES: &str = "log.lines";
    pub const LOG_OVERFLOW: &str = "log.overflow";
    pub const PROCESS_INDEX: &str = "log.processIndex";
    pub const CAPTURE_STATE: &str = "log.captureState";
    pub const TRANSFER_PROGRESS: &str = "transfer.progress";
    pub const GROUP_PROGRESS: &str = "group.progress";
    pub const TASK_SUMMARY: &str = "task.summary";
    pub const SETTINGS_CHANGED: &str = "settings.changed";
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
        }
    }
}
