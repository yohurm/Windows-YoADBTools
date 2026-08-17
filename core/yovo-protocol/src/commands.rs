//! invoke 命令的请求/响应 DTO 与命令库 wire 结构。

use serde::{Deserialize, Serialize};

use crate::{Direction, ExportWriteMode, LogFilter};

/// `adb.exec` 请求。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AdbExecRequest {
    /// 空串 = 不指定设备（仅 `devices` 等全局命令）
    pub serial: String,
    pub argv: Vec<String>,
    /// 超时（毫秒）；None = 不设超时
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_ms: Option<u64>,
}

/// `log.replay` 请求（回补/会话重建）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReplayRequest {
    pub serial: String,
    pub from_seq: u64,
    pub limit: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filter: Option<LogFilter>,
}

/// `log.export` 请求（core 持有全量缓冲，导出必须走 core）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExportRequest {
    pub serial: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filter: Option<LogFilter>,
    /// 目标文件；空 = 按设置目录生成
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(default)]
    pub write_mode: ExportWriteMode,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExportResult {
    pub path: String,
    pub lines: u64,
}

/// 设备路径操作（删除/新建目录）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PathOpRequest {
    pub serial: String,
    pub path: String,
}

/// `files.push/pull` 请求。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TransferRequest {
    pub id: u32,
    pub serial: String,
    pub direction: Direction,
    pub local: String,
    pub remote: String,
}

/// `group.run` 请求（命令模板已由 UI 完成占位符填充）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GroupRunRequest {
    pub group_id: String,
    pub serials: Vec<String>,
}

// ===== 命令库 wire 结构（schemaVersion 2） =====

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct InputFieldDto {
    pub placeholder: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommandDto {
    pub id: String,
    pub name: String,
    /// 已填充占位符的完整命令行（core 负责按引号规则拆分为 argv）
    pub template: String,
    #[serde(default)]
    pub inputs: Vec<InputFieldDto>,
    #[serde(default)]
    pub failure_regex: String,
    #[serde(default)]
    pub success_regex: String,
    #[serde(default)]
    pub delay_ms: u64,
    #[serde(default = "default_true")]
    pub abort_on_fail: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommandGroupDto {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub commands: Vec<CommandDto>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommandLibraryDto {
    pub schema_version: u32,
    #[serde(default)]
    pub groups: Vec<CommandGroupDto>,
}
