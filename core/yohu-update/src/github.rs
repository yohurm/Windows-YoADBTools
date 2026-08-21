//! GitHub Releases Provider：用平台身份匹配 latest Release 里的安装包。

use std::time::Duration;

use reqwest::Client;
use serde::Deserialize;
use yohu_protocol::{RemoteUpdate, PRODUCT_NAME};

use crate::contract::UpdateCheckProvider;
use crate::error::UpdateError;
use crate::platform::PlatformInfo;
use crate::release::{remote_from_release, ReleaseAsset};

const API_LATEST: &str = "https://api.github.com/repos";
pub const DEFAULT_OWNER: &str = "yohurm";
pub const DEFAULT_REPO: &str = "Windows-YoADBTools";

/// GitHub 仓库坐标；token 可选（提高限额 / 私有仓）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitHubReleaseSource {
    pub owner: String,
    pub repo: String,
    pub token: String,
}

impl GitHubReleaseSource {
    pub fn new(owner: impl Into<String>, repo: impl Into<String>) -> Result<Self, UpdateError> {
        let source = Self {
            owner: owner.into().trim().to_string(),
            repo: repo.into().trim().to_string(),
            token: String::new(),
        };
        if source.owner.is_empty() || source.repo.is_empty() {
            return Err(UpdateError::NotConfigured);
        }
        Ok(source)
    }

    pub fn with_token(mut self, token: impl Into<String>) -> Self {
        self.token = token.into().trim().to_string();
        self
    }
}

/// GitHub `/releases/latest` Provider。
pub struct GitHubReleaseProvider {
    source: GitHubReleaseSource,
    endpoint: String,
    client: Client,
}

impl GitHubReleaseProvider {
    pub fn new(source: GitHubReleaseSource) -> Result<Self, UpdateError> {
        let endpoint = latest_endpoint(&source.owner, &source.repo);
        Self::with_endpoint(source, endpoint)
    }

    pub fn with_endpoint(
        source: GitHubReleaseSource,
        endpoint: impl Into<String>,
    ) -> Result<Self, UpdateError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| UpdateError::Network(e.to_string()))?;
        Ok(Self {
            source,
            endpoint: endpoint.into(),
            client,
        })
    }
}

impl UpdateCheckProvider for GitHubReleaseProvider {
    async fn check(&self, platform: &PlatformInfo) -> Result<RemoteUpdate, UpdateError> {
        let mut req = self
            .client
            .get(&self.endpoint)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("User-Agent", format!("{PRODUCT_NAME}/{}", platform.version));
        if !self.source.token.is_empty() {
            req = req.bearer_auth(&self.source.token);
        }
        let response = req.send().await?;
        let status = response.status();
        let text = response.text().await?;
        if status.as_u16() == 404 {
            return Err(UpdateError::Platform("GitHub 上还没有 Release".into()));
        }
        if !status.is_success() {
            let hint = github_error_message(&text);
            if hint.is_empty() {
                return Err(UpdateError::Http(status.as_u16()));
            }
            return Err(UpdateError::Platform(hint));
        }
        parse_release_body(&text, platform)
    }
}

pub fn latest_endpoint(owner: &str, repo: &str) -> String {
    format!("{API_LATEST}/{owner}/{repo}/releases/latest")
}

#[derive(Debug, Deserialize)]
struct GhRelease {
    #[serde(default)]
    tag_name: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    html_url: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    assets: Vec<ReleaseAsset>,
}

pub fn parse_release_body(
    body: &str,
    platform: &PlatformInfo,
) -> Result<RemoteUpdate, UpdateError> {
    let release: GhRelease =
        serde_json::from_str(body).map_err(|e| UpdateError::Parse(e.to_string()))?;
    if release.draft {
        return Err(UpdateError::Platform("最新 Release 仍是草稿".into()));
    }
    remote_from_release(
        &release.tag_name,
        &release.body,
        release.html_url.trim(),
        &release.assets,
        platform,
    )
}

fn github_error_message(body: &str) -> String {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| {
            v.get("message")
                .and_then(|m| m.as_str())
                .map(str::to_string)
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn win64() -> PlatformInfo {
        PlatformInfo {
            version: "0.1.0".into(),
            identifier: "com.yohu.adbtools".into(),
            os: "windows".into(),
            arch: "x86_64".into(),
        }
    }

    #[test]
    fn latest_endpoint_uses_owner_repo() {
        assert_eq!(
            latest_endpoint("yohurm", "Windows-YoADBTools"),
            "https://api.github.com/repos/yohurm/Windows-YoADBTools/releases/latest"
        );
    }

    #[test]
    fn parse_release_uses_platform_version_and_asset() {
        let body = r#"{
            "tag_name": "v1.2.0",
            "body": "fix windows nsis",
            "html_url": "https://github.com/yohurm/Windows-YoADBTools/releases/tag/v1.2.0",
            "draft": false,
            "assets": [
              {
                "name": "YohuAdbTools_1.2.0_x64-setup.exe",
                "browser_download_url": "https://github.com/yohurm/Windows-YoADBTools/releases/download/v1.2.0/YohuAdbTools_1.2.0_x64-setup.exe",
                "size": 6081740,
                "digest": "sha256:deadbeef"
              }
            ]
        }"#;
        let update = parse_release_body(body, &win64()).unwrap();
        assert!(update.has_new_version);
        assert_eq!(update.version, "1.2.0");
        assert_eq!(update.description, "fix windows nsis");
        assert!(update.download_url.ends_with("x64-setup.exe"));
        assert_eq!(update.size_bytes, 6081740);
        assert_eq!(update.sha256, "deadbeef");
        assert!(!update.force_update);
    }

    #[test]
    fn parse_release_same_version_is_not_newer() {
        let body = r#"{
            "tag_name": "0.1.0",
            "body": "",
            "html_url": "https://github.com/o/r/releases/tag/0.1.0",
            "assets": []
        }"#;
        let update = parse_release_body(body, &win64()).unwrap();
        assert!(!update.has_new_version);
        assert_eq!(
            update.download_url,
            "https://github.com/o/r/releases/tag/0.1.0"
        );
    }

    #[test]
    fn empty_owner_rejected() {
        assert!(matches!(
            GitHubReleaseSource::new(" ", "Windows-YoADBTools"),
            Err(UpdateError::NotConfigured)
        ));
    }
}
