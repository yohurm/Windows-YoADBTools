//! Windows 文件名过滤：非法字符、尾空格/点、保留设备名不进 FILEDESCRIPTOR。

const RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// 单段名是否可写入 Windows 文件系统。
pub fn windows_file_name_ok(name: &str) -> bool {
    if name.is_empty() || name.encode_utf16().count() > 255 {
        return false;
    }
    if name == "." || name == ".." {
        return false;
    }
    if name.ends_with(' ') || name.ends_with('.') {
        return false;
    }
    if name.chars().any(|c| {
        matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || c.is_ascii_control()
    }) {
        return false;
    }
    let stem = name.split('.').next().unwrap_or(name);
    !RESERVED.iter().any(|r| stem.eq_ignore_ascii_case(r))
}

/// Explorer 相对路径（`\` 分段）整条合法，且 UTF-16 可放进 `cFileName`（MAX_PATH-1）。
pub fn windows_relative_ok(relative: &str) -> bool {
    if relative.is_empty() {
        return false;
    }
    let utf16 = relative.encode_utf16().count();
    utf16 < 260 && relative.split('\\').all(windows_file_name_ok)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_illegal_chars_trailing_and_reserved() {
        assert!(windows_file_name_ok("photo.png"));
        assert!(!windows_file_name_ok("a<b.txt"));
        assert!(!windows_file_name_ok("a:b"));
        assert!(!windows_file_name_ok("ends "));
        assert!(!windows_file_name_ok("ends."));
        assert!(!windows_file_name_ok("CON"));
        assert!(!windows_file_name_ok("con.txt"));
        assert!(!windows_file_name_ok("NUL.log"));
        assert!(!windows_file_name_ok(".."));
    }

    #[test]
    fn relative_rejects_long_or_bad_segment() {
        assert!(windows_relative_ok("DCIM\\a.jpg"));
        assert!(!windows_relative_ok("DCIM\\con.txt"));
        assert!(!windows_relative_ok(&"a".repeat(260)));
        assert!(windows_relative_ok(&"测".repeat(80)));
    }
}
