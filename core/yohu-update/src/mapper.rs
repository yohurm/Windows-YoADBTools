//! 蒲公英 `/apiv2/app/check` 字段映射为可下载地址。
//!
//! 官方约定：`downloadURL` 才是安装地址（`/apiv2/app/install`）；
//! 落地页短链不能当安装包直链。缺失合法 `downloadURL` 时，用 `_api_key` + `buildKey` 拼接安装接口。

const INSTALL_ENDPOINT: &str = "https://www.pgyer.com/apiv2/app/install";

/// 将平台返回的下载字段解析为可用 http(s) 地址；无法解析则空串。
pub fn resolve_download_url(download_url: &str, build_key: &str, api_key: &str) -> String {
    let trimmed = download_url.trim();
    if is_pgyer_install_url(trimmed) {
        return trimmed.to_string();
    }
    let constructed = construct_install_url(api_key, build_key);
    if !constructed.is_empty() {
        return constructed;
    }
    if is_http_url(trimmed) && !is_pgyer_non_install_page(trimmed) {
        return trimmed.to_string();
    }
    String::new()
}

pub fn parse_file_size(raw: &serde_json::Value) -> u64 {
    match raw {
        serde_json::Value::Number(n) => n.as_u64().unwrap_or(0),
        serde_json::Value::String(s) => s.trim().parse().unwrap_or(0),
        _ => 0,
    }
}

pub fn parse_version_code(value: &str) -> u32 {
    value.trim().parse().unwrap_or(0)
}

pub fn is_http_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.starts_with("https://") || lower.starts_with("http://")
}

pub fn has_usable_url(url: &str) -> bool {
    is_http_url(url.trim())
}

fn construct_install_url(api_key: &str, build_key: &str) -> String {
    let key = api_key.trim();
    let build = build_key.trim();
    if key.is_empty() || build.is_empty() {
        return String::new();
    }
    format!(
        "{INSTALL_ENDPOINT}?_api_key={}&buildKey={}",
        form_encode(key),
        form_encode(build)
    )
}

fn is_pgyer_install_url(url: &str) -> bool {
    is_http_url(url) && url.to_ascii_lowercase().contains("/apiv2/app/install")
}

/// 蒲公英安装单页 / 落地页，不能作为应用内安装包下载地址。
fn is_pgyer_non_install_page(url: &str) -> bool {
    if !is_http_url(url) {
        return false;
    }
    let lower = url.to_ascii_lowercase();
    if lower.contains("/apiv2/app/install") || is_direct_package(&lower) {
        return false;
    }
    lower.contains("://www.pgyer.com/")
        || lower.contains("://pgyer.com/")
        || lower.contains("://www.xcxwo.com/")
        || lower.contains("://www.pgyerapp.com/")
}

fn is_direct_package(lower_url: &str) -> bool {
    lower_url.contains(".apk") || lower_url.contains(".exe") || lower_url.contains(".msi")
}

pub(crate) fn form_encode(value: &str) -> String {
    let mut out = String::new();
    for b in value.as_bytes() {
        match *b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char);
            }
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const API_KEY: &str = "test-api-key";
    const BUILD_KEY: &str = "a1b2c3d4e5f6";
    const INSTALL_URL: &str =
        "https://www.pgyer.com/apiv2/app/install?_api_key=xxx&buildKey=a1b2c3d4e5f6";

    #[test]
    fn official_install_download_url_used_after_trim() {
        let resolved = resolve_download_url(&format!("  {INSTALL_URL}  "), BUILD_KEY, API_KEY);
        assert_eq!(resolved, INSTALL_URL);
    }

    #[test]
    fn empty_download_url_constructs_install_api() {
        let resolved = resolve_download_url("", BUILD_KEY, API_KEY);
        assert_eq!(
            resolved,
            format!(
                "https://www.pgyer.com/apiv2/app/install?_api_key={API_KEY}&buildKey={BUILD_KEY}"
            )
        );
    }

    #[test]
    fn short_page_not_used_when_build_key_present() {
        let resolved = resolve_download_url("https://www.pgyer.com/abcd", BUILD_KEY, API_KEY);
        assert!(resolved.contains("/apiv2/app/install"));
        assert!(resolved.contains(&format!("buildKey={BUILD_KEY}")));
        assert!(!resolved.contains("pgyer.com/abcd"));
    }

    #[test]
    fn short_page_without_build_key_rejected() {
        let resolved = resolve_download_url("https://www.pgyer.com/abcd", "", API_KEY);
        assert_eq!(resolved, "");
    }

    #[test]
    fn landing_page_without_build_key_rejected() {
        let resolved = resolve_download_url("https://www.pgyer.com/app", "", API_KEY);
        assert_eq!(resolved, "");
    }

    #[test]
    fn direct_http_package_kept_when_no_build_key() {
        let cdn = "https://cdn.example.com/YohuAdbTools_0.1.0-setup.exe";
        assert_eq!(resolve_download_url(cdn, "", API_KEY), cdn);
    }

    #[test]
    fn parse_file_size_accepts_string_and_number() {
        assert_eq!(parse_file_size(&serde_json::json!("12345678")), 12345678);
        assert_eq!(parse_file_size(&serde_json::json!(12345678)), 12345678);
        assert_eq!(parse_file_size(&serde_json::json!("")), 0);
        assert_eq!(parse_file_size(&serde_json::Value::Null), 0);
    }

    #[test]
    fn parse_version_code_digits() {
        assert_eq!(parse_version_code("155"), 155);
        assert_eq!(parse_version_code(""), 0);
        assert_eq!(parse_version_code("x"), 0);
    }
}
