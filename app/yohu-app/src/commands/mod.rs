//! 命令层：服务 API（参数校验 → core API → 结果）。
//!
//! **薄命令层纪律**（ADR-slint-005）：只做参数校验 → core API → 结果。
//! 业务逻辑一律在 core crates。错误统一映射为 [`AppError`]。
//! UI 层（rust-slint）进程内直接调用这些函数。

pub mod adb;
pub mod commandlib;
pub mod device;
pub mod files;
pub mod log;
pub mod settings;
pub mod system;
pub mod terminal;
pub mod update;

use yohu_adb::AdbError;
use yohu_domain::RunError;
use yohu_files::FileError;
use yohu_protocol::{AppError, ErrorCode};
use yohu_update::UpdateError;

/// core 错误 → 应用错误（UI 按 code 处理）。
pub fn err_internal(e: impl std::fmt::Display) -> AppError {
    AppError {
        code: ErrorCode::Internal,
        message: e.to_string(),
    }
}

/// ADB 错误 → 应用错误（保留语义码）。
pub fn err_adb(e: AdbError) -> AppError {
    let code = match &e {
        AdbError::DeviceOffline(_) => ErrorCode::DeviceOffline,
        AdbError::Unauthorized => ErrorCode::Unauthorized,
        AdbError::Cancelled => ErrorCode::Cancelled,
        AdbError::ToolUnavailable(_) | AdbError::BadExit { .. } | AdbError::Parse(_) => {
            ErrorCode::AdbError
        }
        AdbError::Timeout => ErrorCode::AdbError,
        AdbError::Io(_) => ErrorCode::Internal,
    };
    AppError {
        code,
        message: e.to_string(),
    }
}

/// domain 执行端口错误 → 应用错误。
pub fn err_run(e: RunError) -> AppError {
    let code = match &e {
        RunError::DeviceOffline(_) => ErrorCode::DeviceOffline,
        RunError::Unauthorized => ErrorCode::Unauthorized,
        RunError::Cancelled => ErrorCode::Cancelled,
        RunError::Timeout | RunError::Adb(_) => ErrorCode::AdbError,
    };
    AppError {
        code,
        message: e.to_string(),
    }
}

/// 构造一个简单应用错误。
pub fn err_code(code: ErrorCode, message: impl Into<String>) -> AppError {
    AppError {
        code,
        message: message.into(),
    }
}

/// 文件模块错误 → 应用错误（路径/安全根走 InvalidArgs，取消保留语义）。
pub fn err_file(e: FileError) -> AppError {
    match e {
        FileError::Path(message) | FileError::OutsideRoot(message) => {
            err_code(ErrorCode::InvalidArgs, message)
        }
        FileError::LocalNotFound(message) => err_code(ErrorCode::NotFound, message),
        FileError::Adb(adb) => err_adb(adb),
    }
}

/// 更新检查错误 → 应用错误。
pub fn err_update(e: UpdateError) -> AppError {
    let code = match e {
        UpdateError::NotConfigured | UpdateError::InvalidUrl => ErrorCode::InvalidArgs,
        UpdateError::NoDownloadUrl => ErrorCode::NotFound,
        UpdateError::Platform(_)
        | UpdateError::Http(_)
        | UpdateError::Network(_)
        | UpdateError::Parse(_) => ErrorCode::Internal,
    };
    AppError {
        code,
        message: e.to_string(),
    }
}
