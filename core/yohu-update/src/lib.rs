//! yohu-update — 应用更新检查。
//!
//! Provider 可替换：默认 GitCode Releases（`yohurm/ReleaseYoADBTools`），可选 GitHub / 蒲公英。
//! 用本机平台身份（版本 / 包标识 / OS / 架构）查询是否有新版本。

pub mod check;
pub mod contract;
pub mod credentials;
pub mod error;
pub mod gitcode;
pub mod github;
pub mod mapper;
pub mod pgyer;
pub mod platform;
pub mod release;

pub use check::{assert_http_url, check_update};
pub use contract::UpdateCheckProvider;
pub use credentials::{
    describe_channel, load_pgyer_credentials, load_update_source, resolve_provider, UpdateSource,
};
pub use error::UpdateError;
pub use gitcode::{GitCodeReleaseProvider, GitCodeReleaseSource};
pub use github::{GitHubReleaseProvider, GitHubReleaseSource};
pub use pgyer::{PgyerCheckProvider, PgyerCredentials};
pub use platform::PlatformInfo;

use std::path::Path;

use yohu_protocol::{RemoteUpdate, UpdateProvider};

/// 按设置项选源，再用 `settings/update.json` / 环境变量补全仓库与密钥。
pub async fn check_configured(
    settings_dir: &Path,
    provider: UpdateProvider,
    platform: PlatformInfo,
) -> Result<RemoteUpdate, UpdateError> {
    match load_update_source(settings_dir, provider)? {
        UpdateSource::GitCode(source) => check_with_gitcode(source, platform).await,
        UpdateSource::GitHub(source) => check_with_github(source, platform).await,
        UpdateSource::Pgyer(credentials) => check_with_pgyer(credentials, platform).await,
    }
}

/// 用蒲公英 Provider 按平台信息检查更新。
pub async fn check_with_pgyer(
    credentials: PgyerCredentials,
    platform: PlatformInfo,
) -> Result<RemoteUpdate, UpdateError> {
    let provider = PgyerCheckProvider::new(credentials)?;
    check_update(&provider, &platform).await
}

/// 用 GitHub Releases Provider 按平台信息检查更新。
pub async fn check_with_github(
    source: GitHubReleaseSource,
    platform: PlatformInfo,
) -> Result<RemoteUpdate, UpdateError> {
    let provider = GitHubReleaseProvider::new(source)?;
    check_update(&provider, &platform).await
}

/// 用 GitCode Releases Provider 按平台信息检查更新。
pub async fn check_with_gitcode(
    source: GitCodeReleaseSource,
    platform: PlatformInfo,
) -> Result<RemoteUpdate, UpdateError> {
    let provider = GitCodeReleaseProvider::new(source)?;
    check_update(&provider, &platform).await
}
