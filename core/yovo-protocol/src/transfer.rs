//! 文件传输与设备文件条目。

use serde::{Deserialize, Serialize};

/// 传输方向。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Direction {
    /// 本机 → 设备
    Push,
    /// 设备 → 本机
    Pull,
}

/// 传输状态。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransferState {
    Running,
    Done,
    Failed,
    Cancelled,
}

/// 传输进度（状态迁移即发；200ms 节流预留）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TransferProgress {
    pub id: u32,
    pub direction: Direction,
    pub bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u64>,
    pub state: TransferState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// 设备文件条目类型。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    Dir,
    File,
    Symlink,
    Other,
}

/// `ls -la` 解析出的条目。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RemoteEntry {
    pub name: String,
    pub kind: EntryKind,
    pub size: u64,
    /// 权限位原文（如 `drwxr-xr-x`）
    pub permission: String,
    /// 符号链接目标（kind = symlink 时）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link_target: Option<String>,
}
