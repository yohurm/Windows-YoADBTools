//! 应用错误模型：core 内部错误映射为 `{ code, message }`，UI 按 code 处理。

use serde::{Deserialize, Serialize};

/// 稳定错误码（UI 只依赖 code，不解析 message 文案）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    InvalidArgs,
    DeviceOffline,
    Unauthorized,
    AdbError,
    NotFound,
    Cancelled,
    Internal,
}

/// 命令/服务层的通用错误。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
}
