//! yohu-update — 应用更新检查。
//!
//! 固定 GitHub Releases（`yohurm/Windows-YoADBTools`）。用本机平台身份查询是否有新版本。

pub mod check;
pub mod contract;
pub mod credentials;
pub mod error;
pub mod github;
pub mod mapper;
pub mod platform;
pub mod release;

pub use check::{assert_http_url, check_update};
pub use contract::UpdateCheckProvider;
pub use credentials::{describe_channel, load_github_source};
pub use error::UpdateError;
pub use github::{GitHubReleaseProvider, GitHubReleaseSource};
pub use platform::PlatformInfo;

use std::path::Path;

use yohu_protocol::RemoteUpdate;

/// 用 `settings/update.json` / 环境变量补全仓库后检查 GitHub Releases。
pub async fn check_configured(
    settings_dir: &Path,
    platform: PlatformInfo,
) -> Result<RemoteUpdate, UpdateError> {
    check_with_github(load_github_source(settings_dir)?, platform).await
}

/// 用 GitHub Releases Provider 按平台信息检查更新。
pub async fn check_with_github(
    source: GitHubReleaseSource,
    platform: PlatformInfo,
) -> Result<RemoteUpdate, UpdateError> {
    let provider = GitHubReleaseProvider::new(source)?;
    check_update(&provider, &platform).await
}
