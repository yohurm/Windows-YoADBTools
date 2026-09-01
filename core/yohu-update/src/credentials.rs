//! GitHub Releases 通道：环境变量与 settings/update.json 可覆盖仓库；token 可选。

use std::path::Path;

use serde::Deserialize;
use yohu_protocol::UpdateChannelInfo;
use yohu_runtime::backup_corrupt;

use crate::error::UpdateError;
use crate::github::{GitHubReleaseSource, DEFAULT_OWNER as GH_OWNER, DEFAULT_REPO as GH_REPO};

const UPDATE_FILE: &str = "update.json";
const ENV_GH_OWNER: &str = "YOHU_GITHUB_OWNER";
const ENV_GH_REPO: &str = "YOHU_GITHUB_REPO";
const ENV_GH_TOKEN: &str = "YOHU_GITHUB_TOKEN";
const ENV_GH_TOKEN_ALT: &str = "GITHUB_TOKEN";

#[derive(Debug, Default, Deserialize)]
struct UpdateFile {
    #[serde(default)]
    github: GitHubFile,
}

#[derive(Debug, Default, Deserialize)]
struct GitHubFile {
    #[serde(default)]
    owner: String,
    #[serde(default)]
    repo: String,
    #[serde(default)]
    token: String,
}

/// 解析 GitHub 仓库坐标。
pub fn load_github_source(settings_dir: &Path) -> Result<GitHubReleaseSource, UpdateError> {
    load_github_source_from(&read_update_file(settings_dir))
}

/// 给设置页展示的通道摘要（不含密钥）。
pub fn describe_channel(settings_dir: &Path) -> Result<UpdateChannelInfo, UpdateError> {
    let source = load_github_source(settings_dir)?;
    Ok(UpdateChannelInfo {
        remote: format!("{}/{}", source.owner, source.repo),
        page_url: format!("https://github.com/{}/{}", source.owner, source.repo),
    })
}

fn load_github_source_from(file: &UpdateFile) -> Result<GitHubReleaseSource, UpdateError> {
    let env_owner = std::env::var(ENV_GH_OWNER).unwrap_or_default();
    let env_repo = std::env::var(ENV_GH_REPO).unwrap_or_default();
    let env_token = std::env::var(ENV_GH_TOKEN)
        .or_else(|_| std::env::var(ENV_GH_TOKEN_ALT))
        .unwrap_or_default();
    let owner = first_non_empty(&[&env_owner, &file.github.owner, compile_gh_owner(), GH_OWNER]);
    let repo = first_non_empty(&[&env_repo, &file.github.repo, compile_gh_repo(), GH_REPO]);
    let token = first_non_empty(&[&env_token, &file.github.token, compile_gh_token()]);
    Ok(GitHubReleaseSource::new(owner, repo)?.with_token(token))
}

fn read_update_file(settings_dir: &Path) -> UpdateFile {
    let path = settings_dir.join(UPDATE_FILE);
    let Ok(text) = std::fs::read_to_string(&path) else {
        return UpdateFile::default();
    };
    match serde_json::from_str(&text) {
        Ok(file) => file,
        Err(_) => {
            let _ = backup_corrupt(&path, &text);
            UpdateFile::default()
        }
    }
}

fn first_non_empty(candidates: &[&str]) -> String {
    candidates
        .iter()
        .map(|s| s.trim())
        .find(|s| !s.is_empty())
        .unwrap_or("")
        .to_string()
}

fn compile_gh_owner() -> &'static str {
    option_env!("YOHU_GITHUB_OWNER").unwrap_or("")
}

fn compile_gh_repo() -> &'static str {
    option_env!("YOHU_GITHUB_REPO").unwrap_or("")
}

fn compile_gh_token() -> &'static str {
    option_env!("YOHU_GITHUB_TOKEN").unwrap_or("")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn isolated_dir() -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!(
            "yohu-update-src-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    fn restore_env(key: &str, old: Option<String>) {
        match old {
            Some(v) => std::env::set_var(key, v),
            None => std::env::remove_var(key),
        }
    }

    #[test]
    fn default_github_origin_repo() {
        let root = isolated_dir();
        let old_owner = std::env::var(ENV_GH_OWNER).ok();
        let old_repo = std::env::var(ENV_GH_REPO).ok();
        std::env::remove_var(ENV_GH_OWNER);
        std::env::remove_var(ENV_GH_REPO);
        let gh = load_github_source(&root).unwrap();
        assert_eq!(gh.owner, GH_OWNER);
        assert_eq!(gh.repo, GH_REPO);
        restore_env(ENV_GH_OWNER, old_owner);
        restore_env(ENV_GH_REPO, old_repo);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn describe_channel_hides_token() {
        let root = isolated_dir();
        let info = describe_channel(&root).unwrap();
        assert_eq!(info.remote, format!("{GH_OWNER}/{GH_REPO}"));
        assert!(info.page_url.starts_with("https://github.com/"));
        let _ = std::fs::remove_dir_all(&root);
    }
}
