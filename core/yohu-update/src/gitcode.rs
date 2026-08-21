//! GitCode Releases Provider：列出仓库 Release，按平台身份匹配 Windows 安装包。

use std::time::Duration;

use reqwest::Client;
use serde::Deserialize;
use yohu_protocol::{RemoteUpdate, PRODUCT_NAME};

use crate::contract::UpdateCheckProvider;
use crate::error::UpdateError;
use crate::platform::PlatformInfo;
use crate::release::{remote_from_release, ReleaseAsset};

const API_REPOS: &str = "https://api.gitcode.com/api/v5/repos";
pub const DEFAULT_OWNER: &str = "yohurm";
pub const DEFAULT_REPO: &str = "ReleaseYoADBTools";

/// GitCode 仓库坐标；token 可选（私有仓 / 提高限额）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitCodeReleaseSource {
    pub owner: String,
    pub repo: String,
    pub token: String,
}

impl GitCodeReleaseSource {
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

    pub fn page_url(&self) -> String {
        format!("https://gitcode.com/{}/{}", self.owner, self.repo)
    }
}

/// GitCode `/repos/{owner}/{repo}/releases` Provider。
pub struct GitCodeReleaseProvider {
    source: GitCodeReleaseSource,
    endpoint: String,
    client: Client,
}

impl GitCodeReleaseProvider {
    pub fn new(source: GitCodeReleaseSource) -> Result<Self, UpdateError> {
        let endpoint = list_endpoint(&source.owner, &source.repo);
        Self::with_endpoint(source, endpoint)
    }

    pub fn with_endpoint(
        source: GitCodeReleaseSource,
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

impl UpdateCheckProvider for GitCodeReleaseProvider {
    async fn check(&self, platform: &PlatformInfo) -> Result<RemoteUpdate, UpdateError> {
        match self.fetch_text(&self.endpoint, &[("per_page", "20")]).await {
            Ok(text) => match parse_releases_body(&text, platform, &self.source) {
                Ok(update) => return Ok(update),
                Err(UpdateError::Platform(msg)) if msg.contains("还没有 Release") => {}
                Err(err) => return Err(err),
            },
            Err(UpdateError::Platform(msg)) if msg.contains("还没有 Release") => {}
            Err(err) => return Err(err),
        }
        self.check_from_tag_files(platform).await
    }
}

impl GitCodeReleaseProvider {
    async fn fetch_text(&self, url: &str, query: &[(&str, &str)]) -> Result<String, UpdateError> {
        let mut req = self
            .client
            .get(url)
            .query(query)
            .header("Accept", "application/json")
            .header("User-Agent", format!("{PRODUCT_NAME}/check"));
        if !self.source.token.is_empty() {
            req = req.query(&[("access_token", self.source.token.as_str())]);
        }
        let response = req.send().await?;
        let status = response.status();
        let text = response.text().await?;
        if is_missing_release(status.as_u16(), &text) {
            return Err(UpdateError::Platform("GitCode 上还没有 Release".into()));
        }
        if !status.is_success() {
            let hint = gitcode_error_message(&text);
            if hint.is_empty() {
                return Err(UpdateError::Http(status.as_u16()));
            }
            return Err(UpdateError::Platform(hint));
        }
        Ok(text)
    }

    /// 发行版 API 为空时，用最新 tag 目录里的 `*_x64-setup.exe`。
    async fn check_from_tag_files(
        &self,
        platform: &PlatformInfo,
    ) -> Result<RemoteUpdate, UpdateError> {
        let tags_url = tags_endpoint(&self.source.owner, &self.source.repo);
        let tags_text = self.fetch_text(&tags_url, &[("per_page", "20")]).await?;
        let tag = latest_tag_name(&tags_text)?;
        let contents_url = contents_endpoint(&self.source.owner, &self.source.repo);
        let contents_text = self
            .fetch_text(&contents_url, &[("ref", tag.as_str())])
            .await?;
        parse_tag_contents(&contents_text, &tag, platform, &self.source)
    }
}

pub fn list_endpoint(owner: &str, repo: &str) -> String {
    format!("{API_REPOS}/{owner}/{repo}/releases")
}

pub fn tags_endpoint(owner: &str, repo: &str) -> String {
    format!("{API_REPOS}/{owner}/{repo}/tags")
}

pub fn contents_endpoint(owner: &str, repo: &str) -> String {
    format!("{API_REPOS}/{owner}/{repo}/contents")
}

fn is_missing_release(status: u16, body: &str) -> bool {
    if status == 404 {
        return true;
    }
    let msg = gitcode_error_message(body);
    status == 400
        && (msg.contains("未找到 release") || msg.to_ascii_lowercase().contains("not found"))
}

fn gitcode_error_message(body: &str) -> String {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| {
            v.get("error_message")
                .or_else(|| v.get("message"))
                .and_then(|m| m.as_str())
                .map(str::to_string)
        })
        .unwrap_or_default()
}

#[derive(Debug, Deserialize)]
struct GcRelease {
    #[serde(default)]
    tag_name: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    html_url: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
    #[serde(default)]
    assets: Vec<ReleaseAsset>,
}

/// 解析 GitCode Release 列表（空列表 = 尚未发版）。
pub fn parse_releases_body(
    body: &str,
    platform: &PlatformInfo,
    source: &GitCodeReleaseSource,
) -> Result<RemoteUpdate, UpdateError> {
    let trimmed = body.trim();
    if trimmed == "[]" {
        return Err(UpdateError::Platform("GitCode 上还没有 Release".into()));
    }
    let releases: Vec<GcRelease> =
        serde_json::from_str(trimmed).map_err(|e| UpdateError::Parse(e.to_string()))?;
    let release = releases
        .into_iter()
        .find(|r| !r.draft && !r.prerelease && !r.tag_name.trim().is_empty())
        .ok_or_else(|| UpdateError::Platform("GitCode 上还没有 Release".into()))?;
    let page = if crate::mapper::is_http_url(release.html_url.trim()) {
        release.html_url.trim().to_string()
    } else {
        format!("{}/releases/{}", source.page_url(), release.tag_name.trim())
    };
    remote_from_release(
        &release.tag_name,
        &release.body,
        &page,
        &release.assets,
        platform,
    )
}

#[derive(Debug, Deserialize)]
struct GcTag {
    #[serde(default)]
    name: String,
}

#[derive(Debug, Deserialize)]
struct GcContent {
    #[serde(default)]
    r#type: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    download_url: String,
    #[serde(default)]
    size: u64,
}

pub fn latest_tag_name(body: &str) -> Result<String, UpdateError> {
    let tags: Vec<GcTag> =
        serde_json::from_str(body.trim()).map_err(|e| UpdateError::Parse(e.to_string()))?;
    let name = tags
        .into_iter()
        .map(|t| t.name.trim().to_string())
        .find(|n| !n.is_empty())
        .ok_or_else(|| UpdateError::Platform("GitCode 上还没有 Release".into()))?;
    Ok(name)
}

pub fn parse_tag_contents(
    body: &str,
    tag: &str,
    platform: &PlatformInfo,
    source: &GitCodeReleaseSource,
) -> Result<RemoteUpdate, UpdateError> {
    let files: Vec<GcContent> =
        serde_json::from_str(body.trim()).map_err(|e| UpdateError::Parse(e.to_string()))?;
    let assets: Vec<ReleaseAsset> = files
        .into_iter()
        .filter(|f| f.r#type == "file")
        .map(|f| ReleaseAsset {
            name: f.name,
            browser_download_url: f.download_url,
            size: f.size,
            digest: String::new(),
        })
        .collect();
    let page = format!("{}/releases/{}", source.page_url(), tag.trim());
    remote_from_release(tag, "", &page, &assets, platform)
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

    fn source() -> GitCodeReleaseSource {
        GitCodeReleaseSource::new(DEFAULT_OWNER, DEFAULT_REPO).unwrap()
    }

    #[test]
    fn list_endpoint_uses_owner_repo() {
        assert_eq!(
            list_endpoint("yohurm", "ReleaseYoADBTools"),
            "https://api.gitcode.com/api/v5/repos/yohurm/ReleaseYoADBTools/releases"
        );
    }

    #[test]
    fn empty_list_is_no_release() {
        let err = parse_releases_body("[]", &win64(), &source()).unwrap_err();
        assert!(matches!(err, UpdateError::Platform(msg) if msg.contains("还没有 Release")));
    }

    #[test]
    fn parse_list_picks_windows_x64_setup() {
        let body = r#"[
          {
            "tag_name": "v1.2.0",
            "body": "windows nsis",
            "prerelease": false,
            "assets": [
              {
                "name": "YohuAdbTools_1.2.0_x64-setup.exe",
                "browser_download_url": "https://gitcode.com/yohurm/ReleaseYoADBTools/releases/download/v1.2.0/YohuAdbTools_1.2.0_x64-setup.exe",
                "size": 6081740
              }
            ]
          }
        ]"#;
        let update = parse_releases_body(body, &win64(), &source()).unwrap();
        assert!(update.has_new_version);
        assert_eq!(update.version, "1.2.0");
        assert_eq!(update.description, "windows nsis");
        assert!(update.download_url.ends_with("x64-setup.exe"));
        assert_eq!(update.size_bytes, 6081740);
    }

    #[test]
    fn skips_prerelease_when_stable_exists() {
        let body = r#"[
          {
            "tag_name": "v9.0.0-beta",
            "prerelease": true,
            "assets": []
          },
          {
            "tag_name": "v0.1.0",
            "body": "stable",
            "prerelease": false,
            "assets": []
          }
        ]"#;
        let update = parse_releases_body(body, &win64(), &source()).unwrap();
        assert_eq!(update.version, "0.1.0");
        assert!(!update.has_new_version);
        assert!(update.download_url.contains("v0.1.0"));
    }

    #[test]
    fn parse_tag_contents_picks_windows_setup() {
        let body = r#"[
          {"type":"file","name":"README.md","download_url":"https://raw.gitcode.com/o/r/blobs/a/README.md"},
          {"type":"file","name":"YohuAdbTools_0.1.0_x64-setup.exe","download_url":"https://raw.gitcode.com/o/r/blobs/b/YohuAdbTools_0.1.0_x64-setup.exe","size":7031295}
        ]"#;
        let update = parse_tag_contents(body, "v0.1.0", &win64(), &source()).unwrap();
        assert!(!update.has_new_version);
        assert_eq!(update.version, "0.1.0");
        assert!(update.download_url.ends_with("x64-setup.exe"));
        assert_eq!(update.size_bytes, 7031295);
    }

    #[test]
    fn latest_tag_name_takes_first() {
        let body = r#"[{"name":"v0.1.0"},{"name":"v0.0.1"}]"#;
        assert_eq!(latest_tag_name(body).unwrap(), "v0.1.0");
    }

    #[test]
    fn missing_release_error_json() {
        assert!(is_missing_release(
            400,
            r#"{"error_code":400,"error_message":"未找到 release"}"#
        ));
    }

    #[test]
    fn empty_owner_rejected() {
        assert!(matches!(
            GitCodeReleaseSource::new(" ", "ReleaseYoADBTools"),
            Err(UpdateError::NotConfigured)
        ));
    }

    #[tokio::test]
    async fn live_default_repo_check() {
        let source = GitCodeReleaseSource::new(DEFAULT_OWNER, DEFAULT_REPO).unwrap();
        let provider = GitCodeReleaseProvider::new(source).unwrap();
        let update = crate::check_update(&provider, &win64())
            .await
            .expect("GitCode 应能读到 v0.1.0 安装包");
        assert_eq!(update.version, "0.1.0");
        assert!(!update.has_new_version);
        assert!(
            update.download_url.contains("x64-setup.exe"),
            "download_url={}",
            update.download_url
        );
    }
}
