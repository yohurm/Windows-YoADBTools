//! 检查编排：把平台信息交给 Provider，有新版本则要求可用下载地址。

use crate::contract::UpdateCheckProvider;
use crate::error::UpdateError;
use crate::mapper;
use crate::platform::PlatformInfo;
use yohu_protocol::RemoteUpdate;

/// 使用当前平台身份检查更新。
pub async fn check_update<P: UpdateCheckProvider>(
    provider: &P,
    platform: &PlatformInfo,
) -> Result<RemoteUpdate, UpdateError> {
    tracing::info!(
        version = %platform.version,
        identifier = %platform.identifier,
        os = %platform.os,
        arch = %platform.arch,
        "开始检查更新"
    );
    let update = provider.check(platform).await?;
    if !update.has_new_version {
        tracing::info!(version = %update.version, "已是最新版本");
        return Ok(update);
    }
    let resolved = update.with_download_url(update.download_url.trim());
    if !mapper::has_usable_url(&resolved.download_url) {
        tracing::warn!(version = %resolved.version, "检查到新版本但无有效下载地址");
        return Err(UpdateError::NoDownloadUrl);
    }
    tracing::info!(
        version = %resolved.version,
        force = resolved.force_update,
        "检查到新版本"
    );
    Ok(resolved)
}

/// 仅允许打开 http(s) 下载地址。
pub fn assert_http_url(url: &str) -> Result<&str, UpdateError> {
    let trimmed = url.trim();
    if mapper::is_http_url(trimmed) {
        Ok(trimmed)
    } else {
        Err(UpdateError::InvalidUrl)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::UpdateError;
    use crate::platform::PlatformInfo;
    use std::sync::Mutex;
    use yohu_protocol::RemoteUpdate;

    struct SpyProvider {
        seen: Mutex<Option<PlatformInfo>>,
        result: Result<RemoteUpdate, UpdateError>,
    }

    impl UpdateCheckProvider for SpyProvider {
        async fn check(&self, platform: &PlatformInfo) -> Result<RemoteUpdate, UpdateError> {
            *self.seen.lock().unwrap() = Some(platform.clone());
            self.result.clone()
        }
    }

    fn platform() -> PlatformInfo {
        PlatformInfo {
            version: "0.1.0".into(),
            identifier: "com.yohu.adbtools".into(),
            os: "windows".into(),
            arch: "x86_64".into(),
        }
    }

    fn remote(has_new: bool, url: &str) -> RemoteUpdate {
        RemoteUpdate {
            has_new_version: has_new,
            version: "1.2.0".into(),
            version_code: 12,
            description: "fix".into(),
            download_url: url.into(),
            force_update: false,
            md5: String::new(),
            sha256: String::new(),
            size_bytes: 0,
        }
    }

    #[tokio::test]
    async fn check_passes_platform_identity_to_provider() {
        let spy = SpyProvider {
            seen: Mutex::new(None),
            result: Ok(remote(false, "")),
        };
        check_update(&spy, &platform()).await.unwrap();
        let seen = spy.seen.lock().unwrap().clone().unwrap();
        assert_eq!(seen.version, "0.1.0");
        assert_eq!(seen.identifier, "com.yohu.adbtools");
        assert_eq!(seen.os, "windows");
        assert_eq!(seen.arch, "x86_64");
    }

    #[tokio::test]
    async fn new_version_without_usable_url_errors() {
        let spy = SpyProvider {
            seen: Mutex::new(None),
            result: Ok(remote(true, "/relative.exe")),
        };
        let err = check_update(&spy, &platform()).await.unwrap_err();
        assert!(matches!(err, UpdateError::NoDownloadUrl));
    }

    #[tokio::test]
    async fn new_version_trims_download_url() {
        let spy = SpyProvider {
            seen: Mutex::new(None),
            result: Ok(remote(true, "  https://cdn.example.com/setup.exe  ")),
        };
        let update = check_update(&spy, &platform()).await.unwrap();
        assert_eq!(update.download_url, "https://cdn.example.com/setup.exe");
    }

    #[test]
    fn assert_http_url_rejects_local_paths() {
        assert!(assert_http_url(r"C:\setup.exe").is_err());
        assert_eq!(
            assert_http_url(" https://example.com/a.exe ").unwrap(),
            "https://example.com/a.exe"
        );
    }
}
