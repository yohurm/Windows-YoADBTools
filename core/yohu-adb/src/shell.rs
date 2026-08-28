//! 设备侧 shell 参数安全转义（ADR-v6-013 的核心侧强制）。
//!
//! `adb shell <cmd> <arg>` 会把剩余参数用空格拼接后交给设备 `sh` 重新解析，
//! 因此任何来自 UI / 实际路径的参数必须先做 POSIX 单引号转义，否则含空格会被
//! 词分割（误操作或错目标），含 `; | $ &` 等元字符会注入设备 shell。
//! 本模块是唯一转义入口，禁止在业务分支里手拼路径到 `adb shell`。

/// POSIX 单引号转义一个参数：`'foo bar'`；内嵌单引号按 `'\''` 闭合-逃逸-重开。
pub fn shell_quote(arg: &str) -> String {
    let mut out = String::with_capacity(arg.len() + 2);
    out.push('\'');
    for c in arg.chars() {
        if c == '\'' {
            out.push_str("'\\''");
        } else {
            out.push(c);
        }
    }
    out.push('\'');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_plain() {
        assert_eq!(shell_quote("foo"), "'foo'");
    }

    #[test]
    fn quotes_spaces() {
        assert_eq!(shell_quote("foo bar"), "'foo bar'");
    }

    #[test]
    fn quotes_metacharacters() {
        assert_eq!(shell_quote("a;rm -rf /"), "'a;rm -rf /'");
        assert_eq!(shell_quote("$(boom)"), "'$(boom)'");
        assert_eq!(shell_quote("a&b|c"), "'a&b|c'");
    }

    #[test]
    fn quotes_embedded_single_quote() {
        assert_eq!(shell_quote("it's"), "'it'\\''s'");
    }

    #[test]
    fn quotes_empty_and_slash() {
        assert_eq!(shell_quote(""), "''");
        assert_eq!(shell_quote("/sdcard/DCIM/a.jpg"), "'/sdcard/DCIM/a.jpg'");
    }
}
