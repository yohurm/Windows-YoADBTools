//! 命令的请求/响应 DTO 与命令库 wire 结构。

use serde::{Deserialize, Serialize};

use crate::{ExportWriteMode, LogFilter};

/// 命令库 schema（domain `CommandLibrary::SCHEMA_VERSION` 与 UI 常量共用）。
pub const COMMAND_LIBRARY_SCHEMA_VERSION: u32 = 2;

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

/// `files.push/pull` 请求。方向由命令名决定；id 由壳发号，不进 DTO。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TransferRequest {
    pub serial: String,
    pub local: String,
    pub remote: String,
}

/// `files.dragOut`：把设备路径交给壳虚拟文件拖出（DoDragDrop 结束后返回）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DragOutRequest {
    pub serial: String,
    pub remotes: Vec<String>,
}

/// `group.run` 请求。组内模板从命令库读取；组执行不接受运行时占位符。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GroupRunRequest {
    pub group_id: String,
    pub serials: Vec<String>,
}

/// `terminal.eval` 请求：按库 id 查找、领域填充占位符、多设备并行判定。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TerminalEvalRequest {
    pub command_id: String,
    #[serde(default)]
    pub values: Vec<String>,
    pub serials: Vec<String>,
}

/// 单台设备的 `terminal.eval` 结果。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SerialEvalResult {
    pub serial: String,
    pub ok: bool,
    pub message: String,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u64,
}

/// `terminal.eval` 响应：原始执行结果 + 领域判定。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EvalResult {
    pub ok: bool,
    pub message: String,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    /// 执行用时（毫秒）
    pub duration_ms: u64,
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
    /// 命令库模板，可含 `{0}` `{1}`；执行前由 domain `fill`，不信任 UI 改写后的行
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transfer_request_has_no_id_or_direction() {
        let parsed: TransferRequest =
            serde_json::from_str(r#"{"serial":"S","local":"C:/a.bin","remote":"/sdcard/a.bin"}"#)
                .unwrap();
        assert_eq!(parsed.serial, "S");
        assert_eq!(parsed.remote, "/sdcard/a.bin");
    }

    #[test]
    fn eval_result_snake_case() {
        let v = serde_json::to_value(EvalResult {
            ok: false,
            message: "退出码 1".into(),
            exit_code: 1,
            stdout: "out".into(),
            stderr: "err".into(),
            duration_ms: 12,
        })
        .unwrap();
        assert_eq!(v["exit_code"], 1);
        assert_eq!(v["duration_ms"], 12);
        assert_eq!(v["ok"], false);
    }

    #[test]
    fn drag_out_request_is_serial_plus_remotes() {
        let parsed: DragOutRequest =
            serde_json::from_str(r#"{"serial":"S","remotes":["/sdcard/a.txt","/sdcard/DCIM"]}"#)
                .unwrap();
        assert_eq!(parsed.serial, "S");
        assert_eq!(parsed.remotes.len(), 2);
    }

    #[test]
    fn terminal_eval_request_is_id_values_serials() {
        let parsed: TerminalEvalRequest = serde_json::from_str(
            r#"{"command_id":"c1","values":["8.8.8.8"],"serials":["S1","S2"]}"#,
        )
        .unwrap();
        assert_eq!(parsed.command_id, "c1");
        assert_eq!(parsed.values, vec!["8.8.8.8"]);
        assert_eq!(parsed.serials.len(), 2);
        assert_eq!(COMMAND_LIBRARY_SCHEMA_VERSION, 2);
    }
}
