//! yohu-update — 应用更新检查 / 下载 / 覆盖安装。
//!
//! 固定 GitHub Releases（`yohurm/Windows-YoADBTools`）。下载 NSIS 安装包后静默 `/S` 覆盖，不引入 tauri-plugin-updater。

pub mod apply;
pub mod check;
pub mod contract;
pub mod credentials;
pub mod download;
pub mod error;
pub mod github;
pub mod mapper;
pub mod platform;
pub mod release;

pub use apply::{installed_exe_path, spawn_overlay_install};
pub use check::{assert_http_url, check_update};
pub use contract::UpdateCheckProvider;
pub use credentials::{describe_channel, load_github_source};
pub use download::{assert_cached_installer, download_installer, installer_dest, update_cache_dir};
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
