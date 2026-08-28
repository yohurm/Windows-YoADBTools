//! 更新通道配置：设置项选源；密钥/仓库覆盖走环境变量与 settings/update.json。

use std::path::Path;

use serde::Deserialize;
use yohu_protocol::{UpdateChannelInfo, UpdateProvider};
use yohu_runtime::backup_corrupt;

use crate::error::UpdateError;
use crate::github::{GitHubReleaseSource, DEFAULT_OWNER as GH_OWNER, DEFAULT_REPO as GH_REPO};
use crate::pgyer::PgyerCredentials;

const UPDATE_FILE: &str = "update.json";
const ENV_PROVIDER: &str = "YOHU_UPDATE_PROVIDER";
const ENV_PGY_API_KEY: &str = "YOHU_PGY_API_KEY";
const ENV_PGY_APP_KEY: &str = "YOHU_PGY_APP_KEY";
const ENV_GH_OWNER: &str = "YOHU_GITHUB_OWNER";
const ENV_GH_REPO: &str = "YOHU_GITHUB_REPO";
const ENV_GH_TOKEN: &str = "YOHU_GITHUB_TOKEN";
const ENV_GH_TOKEN_ALT: &str = "GITHUB_TOKEN";

#[derive(Debug, Default, Deserialize)]
struct UpdateFile {
    #[serde(default)]
    pgyer: PgyerFile,
    #[serde(default)]
    github: GitHubFile,
}

#[derive(Debug, Default, Deserialize)]
struct PgyerFile {
    #[serde(default)]
    api_key: String,
    #[serde(default)]
    app_key: String,
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

/// 已解析的检查通道。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UpdateSource {
    GitHub(GitHubReleaseSource),
    Pgyer(PgyerCredentials),
}

/// 解析最终使用的更新源：环境变量可覆盖设置项，缺省 GitHub。
pub fn resolve_provider(preferred: UpdateProvider) -> UpdateProvider {
    parse_provider(&first_non_empty(&[
        &std::env::var(ENV_PROVIDER).unwrap_or_default(),
        compile_provider(),
    ]))
    .unwrap_or(preferred)
}

/// 解析更新通道。`preferred` 来自设置项 `update_provider`。
pub fn load_update_source(
    settings_dir: &Path,
    preferred: UpdateProvider,
) -> Result<UpdateSource, UpdateError> {
    let file = read_update_file(settings_dir);
    match resolve_provider(preferred) {
        UpdateProvider::Pgyer => Ok(UpdateSource::Pgyer(load_pgyer_credentials_from(&file)?)),
        UpdateProvider::Github => Ok(UpdateSource::GitHub(load_github_source_from(&file)?)),
    }
}

/// 给设置页展示的通道摘要（不含密钥）。
pub fn describe_channel(
    settings_dir: &Path,
    preferred: UpdateProvider,
) -> Result<UpdateChannelInfo, UpdateError> {
    match load_update_source(settings_dir, preferred)? {
        UpdateSource::GitHub(source) => Ok(UpdateChannelInfo {
            provider: UpdateProvider::Github,
            remote: format!("{}/{}", source.owner, source.repo),
            page_url: format!("https://github.com/{}/{}", source.owner, source.repo),
        }),
        UpdateSource::Pgyer(_) => Ok(UpdateChannelInfo {
            provider: UpdateProvider::Pgyer,
            remote: String::new(),
            page_url: String::new(),
        }),
    }
}

/// 解析蒲公英密钥。顺序：环境变量 → `settings_dir/update.json` → 编译期 `YOHU_PGY_*`。
pub fn load_pgyer_credentials(settings_dir: &Path) -> Result<PgyerCredentials, UpdateError> {
    load_pgyer_credentials_from(&read_update_file(settings_dir))
}

fn load_pgyer_credentials_from(file: &UpdateFile) -> Result<PgyerCredentials, UpdateError> {
    let env_api = std::env::var(ENV_PGY_API_KEY).unwrap_or_default();
    let env_app = std::env::var(ENV_PGY_APP_KEY).unwrap_or_default();
    let api_key = first_non_empty(&[&env_api, &file.pgyer.api_key, compile_pgy_api_key()]);
    let app_key = first_non_empty(&[&env_app, &file.pgyer.app_key, compile_pgy_app_key()]);
    PgyerCredentials::new(api_key, app_key)
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
            // 损坏覆盖配置：备份后回落默认。
            let _ = backup_corrupt(&path, &text);
            UpdateFile::default()
        }
    }
}

fn parse_provider(value: &str) -> Option<UpdateProvider> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower == "pgyer" || lower == "pgy" || trimmed == "蒲公英" {
        Some(UpdateProvider::Pgyer)
    } else if lower == "github" || lower == "gh" {
        Some(UpdateProvider::Github)
    } else {
        None
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

fn compile_provider() -> &'static str {
    option_env!("YOHU_UPDATE_PROVIDER").unwrap_or("")
}

fn compile_pgy_api_key() -> &'static str {
    option_env!("YOHU_PGY_API_KEY").unwrap_or("")
}

fn compile_pgy_app_key() -> &'static str {
    option_env!("YOHU_PGY_APP_KEY").unwrap_or("")
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
    fn load_from_update_json_pgyer() {
        let root = isolated_dir();
        std::fs::write(
            root.join(UPDATE_FILE),
            r#"{"pgyer":{"api_key":"file-api","app_key":"file-app"}}"#,
        )
        .unwrap();
        let old_api = std::env::var(ENV_PGY_API_KEY).ok();
        let old_app = std::env::var(ENV_PGY_APP_KEY).ok();
        std::env::remove_var(ENV_PGY_API_KEY);
        std::env::remove_var(ENV_PGY_APP_KEY);
        let creds = load_pgyer_credentials(&root).unwrap();
        assert_eq!(creds.api_key, "file-api");
        assert_eq!(creds.app_key, "file-app");
        restore_env(ENV_PGY_API_KEY, old_api);
        restore_env(ENV_PGY_APP_KEY, old_app);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn setting_can_select_github_origin_repo() {
        let root = isolated_dir();
        let old_provider = std::env::var(ENV_PROVIDER).ok();
        let old_owner = std::env::var(ENV_GH_OWNER).ok();
        let old_repo = std::env::var(ENV_GH_REPO).ok();
        std::env::remove_var(ENV_PROVIDER);
        std::env::remove_var(ENV_GH_OWNER);
        std::env::remove_var(ENV_GH_REPO);
        let source = load_update_source(&root, UpdateProvider::Github).unwrap();
        match source {
            UpdateSource::GitHub(gh) => {
                assert_eq!(gh.owner, GH_OWNER);
                assert_eq!(gh.repo, GH_REPO);
            }
            other => panic!("应走 GitHub，得到 {other:?}"),
        }
        restore_env(ENV_PROVIDER, old_provider);
        restore_env(ENV_GH_OWNER, old_owner);
        restore_env(ENV_GH_REPO, old_repo);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn describe_channel_hides_token() {
        let root = isolated_dir();
        let old_provider = std::env::var(ENV_PROVIDER).ok();
        std::env::remove_var(ENV_PROVIDER);
        let info = describe_channel(&root, UpdateProvider::Github).unwrap();
        assert_eq!(info.provider, UpdateProvider::Github);
        assert_eq!(info.remote, format!("{GH_OWNER}/{GH_REPO}"));
        assert!(info.page_url.starts_with("https://github.com/"));
        restore_env(ENV_PROVIDER, old_provider);
        let _ = std::fs::remove_dir_all(&root);
    }
}
