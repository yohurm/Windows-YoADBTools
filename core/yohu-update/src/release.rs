//! 仓库 Release 公共解析：版本比较、安装包匹配、组装 RemoteUpdate。

use yohu_protocol::RemoteUpdate;

use crate::error::UpdateError;
use crate::platform::PlatformInfo;

/// 仓库 Release 里的一个附件（平台字段对齐）。
#[derive(Debug, Clone, serde::Deserialize)]
pub struct ReleaseAsset {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub browser_download_url: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub digest: String,
}

/// 比较 tag / 版本号：去掉 `v` 前缀后按数字段比较。
pub fn is_newer(remote: &str, current: &str) -> bool {
    let remote = version_parts(remote);
    let current = version_parts(current);
    let len = remote.len().max(current.len());
    for i in 0..len {
        let a = remote.get(i).copied().unwrap_or(0);
        let b = current.get(i).copied().unwrap_or(0);
        if a != b {
            return a > b;
        }
    }
    false
}

/// 去掉 tag 的 `v`/`V` 前缀。
pub fn strip_tag_prefix(tag: &str) -> &str {
    tag.trim().trim_start_matches(['v', 'V']).trim()
}

fn version_parts(value: &str) -> Vec<u64> {
    strip_tag_prefix(value)
        .split(|c: char| !c.is_ascii_digit())
        .filter(|p| !p.is_empty())
        .filter_map(|p| p.parse().ok())
        .collect()
}

/// 按当前 OS / 架构挑安装包。
pub fn pick_asset<'a>(
    assets: &'a [ReleaseAsset],
    platform: &PlatformInfo,
) -> Option<&'a ReleaseAsset> {
    assets
        .iter()
        .filter(|a| crate::mapper::is_http_url(a.browser_download_url.trim()))
        .filter_map(|a| {
            let score = asset_score(&a.name, platform)?;
            Some((score, a))
        })
        .max_by_key(|(score, a)| (*score, a.size))
        .map(|(_, a)| a)
}

/// 按当前 OS / 架构给安装包打分；明显不匹配返回 None。
fn asset_score(name: &str, platform: &PlatformInfo) -> Option<i32> {
    let n = name.to_ascii_lowercase();
    if n.is_empty() {
        return None;
    }
    let os = platform.os.to_ascii_lowercase();
    let arch = platform.arch.to_ascii_lowercase();
    let is_x64 = arch == "x86_64" || arch == "amd64";
    let is_arm64 = arch == "aarch64" || arch == "arm64";

    if os == "windows"
        && (contains_any(
            &n,
            &[
                ".dmg",
                ".appimage",
                ".deb",
                ".rpm",
                ".apk",
                "darwin",
                "macos",
                "osx",
            ],
        ) || (contains_any(&n, &["linux"]) && !n.contains("win")))
    {
        return None;
    }
    if is_x64
        && contains_any(&n, &["arm64", "aarch64", "armv7"])
        && !contains_any(&n, &["x64", "x86_64", "amd64"])
    {
        return None;
    }
    if is_arm64
        && contains_any(&n, &["x64", "x86_64", "amd64", "win32", "i686"])
        && !contains_any(&n, &["arm64", "aarch64"])
    {
        return None;
    }

    let mut score = 0;
    if os == "windows" {
        if n.ends_with(".exe") {
            score += 12;
        } else if n.ends_with(".msi") {
            score += 10;
        } else {
            return None;
        }
        if n.contains("setup") {
            score += 6;
        }
        if n.contains("nsis") {
            score += 3;
        }
        if n.contains("win") {
            score += 2;
        }
    }
    if is_x64 && contains_any(&n, &["x64", "x86_64", "amd64", "win64"]) {
        score += 8;
    }
    if is_arm64 && contains_any(&n, &["arm64", "aarch64"]) {
        score += 8;
    }

    Some(score)
}

fn contains_any(hay: &str, needles: &[&str]) -> bool {
    needles.iter().any(|n| hay.contains(n))
}

fn sha256_from_digest(digest: &str) -> String {
    let d = digest.trim();
    let lower = d.to_ascii_lowercase();
    if let Some(rest) = lower.strip_prefix("sha256:") {
        rest.to_string()
    } else {
        String::new()
    }
}

/// 把一份 Release 元数据编成 `RemoteUpdate`。
pub fn remote_from_release(
    tag_name: &str,
    body: &str,
    page_url: &str,
    assets: &[ReleaseAsset],
    platform: &PlatformInfo,
) -> Result<RemoteUpdate, UpdateError> {
    let version = strip_tag_prefix(tag_name).to_string();
    if version.is_empty() {
        return Err(UpdateError::Parse("Release 缺少 tag_name".into()));
    }
    let (download_url, size_bytes, sha256) = if let Some(asset) = pick_asset(assets, platform) {
        (
            asset.browser_download_url.trim().to_string(),
            asset.size,
            sha256_from_digest(&asset.digest),
        )
    } else {
        (page_url.trim().to_string(), 0, String::new())
    };
    Ok(RemoteUpdate {
        has_new_version: is_newer(&version, &platform.version),
        version,
        version_code: 0,
        description: body.trim().to_string(),
        download_url,
        force_update: false,
        md5: String::new(),
        sha256,
        size_bytes,
    })
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

    fn asset(name: &str, url: &str, size: u64) -> ReleaseAsset {
        ReleaseAsset {
            name: name.into(),
            browser_download_url: url.into(),
            size,
            digest: String::new(),
        }
    }

    #[test]
    fn is_newer_strips_v_and_compares_semver() {
        assert!(is_newer("v1.2.0", "0.1.0"));
        assert!(is_newer("0.2.0", "0.1.9"));
        assert!(!is_newer("0.1.0", "0.1.0"));
        assert!(!is_newer("v0.1.0", "0.1.0"));
        assert!(!is_newer("0.0.9", "0.1.0"));
    }

    #[test]
    fn pick_asset_prefers_windows_x64_setup() {
        let assets = vec![
            asset(
                "YohuAdbTools_1.2.0_aarch64.dmg",
                "https://example.com/mac.dmg",
                10,
            ),
            asset(
                "YohuAdbTools_1.2.0_x64-setup.exe",
                "https://example.com/YohuAdbTools_1.2.0_x64-setup.exe",
                20,
            ),
            asset(
                "YohuAdbTools_1.2.0_arm64-setup.exe",
                "https://example.com/arm.exe",
                30,
            ),
        ];
        let picked = pick_asset(&assets, &win64()).unwrap();
        assert!(picked.name.contains("x64-setup.exe"));
    }

    #[test]
    fn remote_from_release_same_version_is_not_newer() {
        let update = remote_from_release(
            "0.1.0",
            "",
            "https://github.com/yohurm/Windows-YoADBTools",
            &[],
            &win64(),
        )
        .unwrap();
        assert!(!update.has_new_version);
        assert_eq!(
            update.download_url,
            "https://github.com/yohurm/Windows-YoADBTools"
        );
    }
}
