//! threadtime 行解析。
//!
//! 格式：`MM-DD HH:MM:SS.mmm  PID  TID L TAG: MSG`（L = V/D/I/W/E/F）。
//! 宽容解析：格式漂移降级为「整行消息」（pid=0、level='?'），不中断采集。

use yovo_protocol::LogLine;

/// 解析一行 threadtime 输出；`seq` 由环形缓冲分配（此处为 0）。
pub fn parse_threadtime(raw: &str) -> LogLine {
    let fallback = || LogLine {
        seq: 0,
        ts: String::new(),
        pid: 0,
        tid: 0,
        level: '?',
        tag: String::new(),
        msg: raw.to_string(),
    };

    // 时间戳固定 18 字符：`MM-DD HH:MM:SS.mmm`
    if raw.len() < 18 || raw.as_bytes().get(2) != Some(&b'-') {
        return fallback();
    }
    let ts = raw[..18].to_string();
    let rest = raw[18..].trim_start();
    if rest.is_empty() {
        return fallback();
    }

    // pid / tid / 「level + 剩余原文」：剩余部分必须保留（消息可含空格与冒号）
    let mut fields = rest.split_whitespace();
    let (pid, tid, level_tag) = match (fields.next(), fields.next(), fields.next()) {
        (Some(pid_str), Some(tid_str), Some(level_first)) => {
            let (Ok(pid), Ok(tid)) = (pid_str.parse::<u32>(), tid_str.parse::<u32>()) else {
                return fallback();
            };
            let rest_tokens: Vec<&str> = fields.collect();
            let level_tag = if rest_tokens.is_empty() {
                level_first.to_string()
            } else {
                format!("{level_first} {}", rest_tokens.join(" "))
            };
            (pid, tid, level_tag)
        }
        _ => return fallback(),
    };

    // level_tag 形如 `I TAG: MSG` 或 `I`（无 tag 的行）
    let mut chars = level_tag.chars();
    let Some(level) = chars.next() else {
        return fallback();
    };
    let after_level = chars.as_str();
    if after_level.is_empty() {
        return fallback();
    }

    let (tag, msg) = match after_level.split_once(':') {
        Some((t, m)) => (t.trim().to_string(), m.trim_start().to_string()),
        None => (String::new(), after_level.trim_start().to_string()),
    };

    LogLine { seq: 0, ts, pid, tid, level, tag, msg }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_normal_line() {
        let line = parse_threadtime("01-02 03:04:05.678  1234  5678 I ActivityManager: Start proc 1234");
        assert_eq!(line.ts, "01-02 03:04:05.678");
        assert_eq!(line.pid, 1234);
        assert_eq!(line.tid, 5678);
        assert_eq!(line.level, 'I');
        assert_eq!(line.tag, "ActivityManager");
        assert_eq!(line.msg, "Start proc 1234");
    }

    #[test]
    fn parses_single_char_pid() {
        let line = parse_threadtime("01-02 03:04:05.678     1     2 E T: boom");
        assert_eq!(line.pid, 1);
        assert_eq!(line.tid, 2);
        assert_eq!(line.level, 'E');
    }

    #[test]
    fn degrades_on_malformed() {
        let line = parse_threadtime("this is not a logcat line at all");
        assert_eq!(line.level, '?');
        assert_eq!(line.pid, 0);
        assert_eq!(line.msg, "this is not a logcat line at all");
    }

    #[test]
    fn msg_can_contain_colons() {
        let line = parse_threadtime("01-02 03:04:05.678  100  200 W Net: http://a:8080 failed");
        assert_eq!(line.tag, "Net");
        assert_eq!(line.msg, "http://a:8080 failed");
    }
}
