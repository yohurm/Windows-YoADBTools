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

    // 跳过 logd 缓冲区头（`--------- beginning of main`）
    let trimmed = raw.trim_start();
    if trimmed.starts_with("---------") {
        return fallback();
    }

    // 时间戳：`MM-DD HH:MM:SS.mmm`（usec 时小数更长，取到第一个空格前）
    if raw.len() < 18 || raw.as_bytes().get(2) != Some(&b'-') {
        return fallback();
    }
    let ts_end = raw.find(' ').and_then(|i| raw[i + 1..].find(' ').map(|j| i + 1 + j)).unwrap_or(18);
    let ts = raw[..ts_end].to_string();
    let rest = raw[ts_end..].trim_start();
    if rest.is_empty() {
        return fallback();
    }

    // pid / tid / 级别：可选 UID 列（Android 14+ `logcat -v threadtime,uid`）
    let tokens: Vec<&str> = rest.split_whitespace().collect();
    let is_level_token = |s: &str| -> bool {
        matches!(s.as_bytes().first(), Some(b'V' | b'D' | b'I' | b'W' | b'E' | b'F' | b'v' | b'd' | b'i' | b'w' | b'e' | b'f'))
    };
    let (pid, tid, level_tag) = match tokens.as_slice() {
        [_, pid_str, tid_str, level_first, rest @ ..]
            if pid_str.parse::<u32>().is_ok()
                && tid_str.parse::<u32>().is_ok()
                && is_level_token(level_first) =>
        {
            let pid = pid_str.parse().unwrap_or(0);
            let tid = tid_str.parse().unwrap_or(0);
            let mut level_tag = (*level_first).to_string();
            if !rest.is_empty() {
                level_tag.push(' ');
                level_tag.push_str(&rest.join(" "));
            }
            (pid, tid, level_tag)
        }
        [pid_str, tid_str, level_first, rest @ ..]
            if pid_str.parse::<u32>().is_ok() && tid_str.parse::<u32>().is_ok() && is_level_token(level_first) =>
        {
            let pid = pid_str.parse().unwrap_or(0);
            let tid = tid_str.parse().unwrap_or(0);
            let mut level_tag = (*level_first).to_string();
            if !rest.is_empty() {
                level_tag.push(' ');
                level_tag.push_str(&rest.join(" "));
            }
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

    #[test]
    fn skips_buffer_header() {
        let line = parse_threadtime("--------- beginning of main");
        assert_eq!(line.level, '?');
    }

    #[test]
    fn parses_optional_uid_column() {
        let line = parse_threadtime("05-26 11:02:36.886  1000  5689  5689 D AndroidRuntime: CheckJNI is OFF");
        assert_eq!(line.pid, 5689);
        assert_eq!(line.tid, 5689);
        assert_eq!(line.level, 'D');
        assert_eq!(line.tag, "AndroidRuntime");
    }
}
