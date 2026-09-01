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
}

impl From<reqwest::Error> for UpdateError {
    fn from(e: reqwest::Error) -> Self {
        UpdateError::Network(e.to_string())
    }
}
