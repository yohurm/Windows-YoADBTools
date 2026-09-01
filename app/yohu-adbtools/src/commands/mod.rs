//! 命令层：Tauri invoke 处理器。
//!
//! **薄命令层纪律**（ADR-v6-005）：只做参数反序列化 → core API → 结果序列化。
//! 业务逻辑一律在 core crates。错误统一映射为 [`IpcError`]。

pub mod adb;
pub mod commandlib;
pub mod device;
pub mod files;
pub mod log;
pub mod mirror;
pub mod settings;
pub mod system;
pub mod terminal;
pub mod update;

use yohu_adb::AdbError;
use yohu_domain::RunError;
use yohu_files::FileError;
use yohu_protocol::{IpcError, IpcErrorCode};
use yohu_update::UpdateError;

/// core 错误 → IPC 错误（前端按 code 处理）。
pub fn ipc(e: impl std::fmt::Display) -> IpcError {
    IpcError {
        code: IpcErrorCode::Internal,
        message: e.to_string(),
    }
}

/// ADB 错误 → IPC 错误（保留语义码）。
pub fn ipc_adb(e: AdbError) -> IpcError {
    let code = match &e {
        AdbError::DeviceOffline(_) => IpcErrorCode::DeviceOffline,
        AdbError::Unauthorized => IpcErrorCode::Unauthorized,
        AdbError::Cancelled => IpcErrorCode::Cancelled,
        AdbError::ToolUnavailable(_) | AdbError::BadExit { .. } | AdbError::Parse(_) => {
            IpcErrorCode::AdbError
        }
        AdbError::Timeout => IpcErrorCode::AdbError,
        AdbError::Io(_) => IpcErrorCode::Internal,
    };
    IpcError {
        code,
        message: e.to_string(),
    }
}

/// domain 执行端口错误 → IPC。
pub fn ipc_run(e: RunError) -> IpcError {
    let code = match &e {
        RunError::DeviceOffline(_) => IpcErrorCode::DeviceOffline,
        RunError::Unauthorized => IpcErrorCode::Unauthorized,
        RunError::Cancelled => IpcErrorCode::Cancelled,
        RunError::Timeout | RunError::Adb(_) => IpcErrorCode::AdbError,
    };
    IpcError {
        code,
        message: e.to_string(),
    }
}

/// 构造一个简单 IPC 错误。
pub fn ipc_code(code: IpcErrorCode, message: impl Into<String>) -> IpcError {
    IpcError {
        code,
        message: message.into(),
    }
}

/// 文件模块错误 → IPC（路径/安全根走 InvalidArgs，取消保留语义）。
pub fn ipc_file(e: FileError) -> IpcError {
    match e {
        FileError::Path(message) | FileError::OutsideRoot(message) => {
            ipc_code(IpcErrorCode::InvalidArgs, message)
        }
        FileError::LocalNotFound(message) => ipc_code(IpcErrorCode::NotFound, message),
        FileError::Adb(adb) => ipc_adb(adb),
    }
}

/// 更新检查错误 → IPC。
pub fn ipc_update(e: UpdateError) -> IpcError {
    let code = match e {
        UpdateError::NotConfigured
        | UpdateError::InvalidUrl
        | UpdateError::InvalidInstaller
        | UpdateError::TooLarge
        | UpdateError::ChecksumMismatch
        | UpdateError::SizeMismatch => IpcErrorCode::InvalidArgs,
        UpdateError::NoDownloadUrl | UpdateError::InstallerNotFound => IpcErrorCode::NotFound,
        UpdateError::Cancelled => IpcErrorCode::Cancelled,
        UpdateError::Platform(_)
        | UpdateError::Http(_)
        | UpdateError::Network(_)
        | UpdateError::Parse(_)
        | UpdateError::Io(_)
        | UpdateError::NotWindows => IpcErrorCode::Internal,
    };
    IpcError {
        code,
        message: e.to_string(),
    }
}
