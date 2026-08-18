//! IPC 错误模型：core 内部错误映射为 `{ code, message }`，前端按 code 处理。

use serde::{Deserialize, Serialize};

/// 稳定错误码（前端只依赖 code，不解析 message 文案）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IpcErrorCode {
    InvalidArgs,
    DeviceOffline,
    Unauthorized,
    AdbError,
    NotFound,
    AlreadyRunning,
    Cancelled,
    Internal,
}

/// 跨 IPC 的通用错误。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IpcError {
    pub code: IpcErrorCode,
    pub message: String,
}
