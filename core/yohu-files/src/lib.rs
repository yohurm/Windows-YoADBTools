//! yohu-files — 文件模块服务。
//!
//! 高内聚边界：浏览/传输/变更；**危险路径校验在 core 侧强制**（ADR-v6-013），
//! 不信任 UI 传来的路径。

pub mod browse;
pub mod mutate;
pub mod transfer;

pub use browse::FileBrowser;
pub use mutate::FileMutator;
pub use transfer::{TransferRunner, TransferSpec};

use thiserror::Error;

/// 文件服务错误。
#[derive(Debug, Error)]
pub enum FileError {
    #[error("路径非法: {0}")]
    Path(String),
    #[error("路径不在安全根内: {0}")]
    OutsideRoot(String),
    #[error("本地文件不存在: {0}")]
    LocalNotFound(String),
    #[error("ADB 错误: {0}")]
    Adb(#[from] yohu_adb::AdbError),
}
