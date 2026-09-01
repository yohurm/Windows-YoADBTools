//! 更新检查错误。

use thiserror::Error;

/// 更新模块错误。
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum UpdateError {
    #[error("未配置 GitHub 仓库（settings/update.json 或 YOHU_GITHUB_*）")]
    NotConfigured,
    #[error("未获取到有效下载地址")]
    NoDownloadUrl,
    #[error("更新平台返回错误: {0}")]
    Platform(String),
    #[error("检查更新 HTTP {0}")]
    Http(u16),
    #[error("检查更新失败: {0}")]
    Network(String),
    #[error("解析更新响应失败: {0}")]
    Parse(String),
    #[error("下载地址非法")]
    InvalidUrl,
    #[error("安装包文件名非法")]
    InvalidInstaller,
    #[error("安装包过大")]
    TooLarge,
    #[error("安装包校验失败（SHA-256 不匹配）")]
    ChecksumMismatch,
    #[error("安装包大小不匹配")]
    SizeMismatch,
    #[error("安装包不存在或已失效")]
    InstallerNotFound,
    #[error("更新已取消")]
    Cancelled,
    #[error("覆盖安装仅支持 Windows")]
    NotWindows,
    #[error("写入安装包失败: {0}")]
    Io(String),
}

impl From<reqwest::Error> for UpdateError {
    fn from(e: reqwest::Error) -> Self {
        UpdateError::Network(e.to_string())
    }
}
