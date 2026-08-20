//! threadtime 行解析。
//!
//! 格式：`MM-DD HH:MM:SS.mmm  PID  TID L TAG: MSG`（L = V/D/I/W/E/F）。
//! `logcat -v threadtime,uid` 在 PID 前多一列 UID：数字或名（`root`/`shell`/`wifi`/`u0_a123`）。
//! 宽容解析：格式漂移降级为「整行消息」（pid=0、level='?'），不中断采集。

use yohu_protocol::LogLine;

fn is_level_token(s: &str) -> bool {
    matches!(s, "V" | "D" | "I" | "W" | "E" | "F" | "v" | "d" | "i" | "w" | "e" | "f")
}

fn parse_u32(s: &str) -> Option<u32> {
    s.parse().ok()
}

fn level_tag_from<'a>(level_first: &'a str, rest: &[&'a str]) -> String {
    let mut level_tag = (*level_first).to_string();
    if !rest.is_empty() {
        level_tag.push(' ');
        level_tag.push_str(&rest.join(" "));
    }
    level_tag
}

/// 解析一行 threadtime 输出；`seq` 由环形缓冲分配（此处为 0）。
pub fn parse_threadtime(raw: &str) -> LogLine {
    let fallback = || LogLine {
        seq: 0,
        ts: String::new(),
        pid: 0,
        tid: 0,
        uid: None,
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

    // pid / tid / 级别：可选 UID 列（数字或名）
    let tokens: Vec<&str> = rest.split_whitespace().collect();
    let (pid, tid, uid, level_tag) = match tokens.as_slice() {
        [uid_str, pid_str, tid_str, level_first, rest @ ..]
            if parse_u32(pid_str).is_some() && parse_u32(tid_str).is_some() && is_level_token(level_first) =>
        {
            (
                parse_u32(pid_str).unwrap_or(0),
                parse_u32(tid_str).unwrap_or(0),
                Some((*uid_str).to_string()),
                level_tag_from(level_first, rest),
            )
        }
        [pid_str, tid_str, level_first, rest @ ..]
            if parse_u32(pid_str).is_some() && parse_u32(tid_str).is_some() && is_level_token(level_first) =>
        {
            (
                parse_u32(pid_str).unwrap_or(0),
                parse_u32(tid_str).unwrap_or(0),
                None,
                level_tag_from(level_first, rest),
            )
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

    LogLine { seq: 0, ts, pid, tid, uid, level, tag, msg }
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
        assert_eq!(line.uid, None);
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
        assert_eq!(line.uid.as_deref(), Some("1000"));
        assert_eq!(line.pid, 5689);
        assert_eq!(line.tid, 5689);
        assert_eq!(line.level, 'D');
        assert_eq!(line.tag, "AndroidRuntime");
    }

    #[test]
    fn parses_named_uid() {
        let line = parse_threadtime(
            "08-20 18:48:42.359 shell  1705  1705 W binder:1705_2: type=1400 audit(0.0:2200040): avc: denied",
        );
        assert_eq!(line.uid.as_deref(), Some("shell"));
        assert_eq!(line.pid, 1705);
        assert_eq!(line.tid, 1705);
        assert_eq!(line.level, 'W');
        assert_eq!(line.tag, "binder");
        assert!(line.msg.contains("type=1400"));
    }

    #[test]
    fn parses_root_uid_empty_tag() {
        let line = parse_threadtime("08-20 18:48:42.342  root     0     0 I         : [    C4] swpm_sp_routine");
        assert_eq!(line.uid.as_deref(), Some("root"));
        assert_eq!(line.pid, 0);
        assert_eq!(line.tid, 0);
        assert_eq!(line.level, 'I');
        assert_eq!(line.tag, "");
        assert!(line.msg.contains("swpm_sp_routine"));
    }
}
