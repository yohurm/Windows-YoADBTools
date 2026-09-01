//! 下载地址校验（仅 http/https）。

pub fn is_http_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.starts_with("https://") || lower.starts_with("http://")
}

pub fn has_usable_url(url: &str) -> bool {
    is_http_url(url.trim())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn http_and_https_ok() {
        assert!(is_http_url("https://example.com/a.exe"));
        assert!(is_http_url("http://example.com/a.exe"));
        assert!(has_usable_url("  https://cdn.example.com/setup.exe  "));
        assert!(!is_http_url("ftp://x"));
        assert!(!has_usable_url(""));
        assert!(!has_usable_url("C:\\setup.exe"));
    }
}
