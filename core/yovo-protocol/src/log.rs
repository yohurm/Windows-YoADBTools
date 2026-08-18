//! 日志域 wire 类型：logcat 行、批量协议、过滤作用域、进程索引。

use serde::{Deserialize, Serialize};

/// 一条已解析的 logcat 行。
///
/// `seq` 由 core 的共享环形缓冲单调分配（设备内递增），
/// 是 UI 回补（`log.replay`）与溢出检测（`log.overflow`）的锚点。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LogLine {
    pub seq: u64,
    /// threadtime 时间戳原文（`MM-DD HH:MM:SS.mmm`）
    pub ts: String,
    pub pid: u32,
    pub tid: u32,
    /// `logcat -v threadtime,uid` 的 UID；旧格式或缺列时为 None
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uid: Option<u32>,
    /// 级别字母：V/D/I/W/E/F；解析失败时为 '?'
    pub level: char,
    pub tag: String,
    pub msg: String,
}

impl LogLine {
    /// 还原为导出的文本行（导出 txt 使用）。
    pub fn raw_text(&self) -> String {
        format!(
            "{} {:>5} {:>5} {} {}: {}",
            self.ts, self.pid, self.tid, self.level, self.tag, self.msg
        )
    }
}

/// 一个批量推送（ADR-v6-007：100–200ms 聚合，禁逐行）。
///
/// `from_seq` = 本批首行的 seq；`truncated` 表示本批之后环内仍有更新行。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LogBatch {
    pub serial: String,
    pub from_seq: u64,
    pub lines: Vec<LogLine>,
    pub truncated: bool,
}

/// 级别序（用于「最低级别含以上」过滤）：V < D < I < W < E < F；未知为 0。
pub fn level_rank(level: char) -> u8 {
    match level {
        'V' | 'v' => 1,
        'D' | 'd' => 2,
        'I' | 'i' => 3,
        'W' | 'w' => 4,
        'E' | 'e' => 5,
        'F' | 'f' => 6,
        _ => 0,
    }
}

/// 采集状态。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptureState {
    Running,
    Stopped,
}

/// 进程索引条目（`ps -A -o PID,NAME`）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProcessEntry {
    pub pid: u32,
    /// 进程名（≈包名）
    pub name: String,
}

/// 进程索引快照。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProcessIndexSnapshot {
    pub serial: String,
    pub entries: Vec<ProcessEntry>,
    /// 本次刷新失败（降级为「仅 PID 模式」）
    pub degraded: bool,
}

/// 过滤作用域：空 `package.pids` = 无命中（与 UI 包名会话一致）。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LogScope {
    #[default]
    All,
    Pid {
        pid: u32,
    },
    Package {
        pids: Vec<u32>,
    },
}

/// 日志过滤条件（会话过滤 / 导出 / 回补共用）。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct LogFilter {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_level: Option<char>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tag_contains: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_contains: Option<String>,
    #[serde(default)]
    pub scope: LogScope,
}

impl LogFilter {
    /// 单行匹配。`Package { pids: [] }` 不命中任何行。
    pub fn matches(&self, line: &LogLine) -> bool {
        if let Some(min) = self.min_level {
            if level_rank(line.level) < level_rank(min) {
                return false;
            }
        }
        if let Some(tag) = &self.tag_contains {
            if !line.tag.to_lowercase().contains(&tag.to_lowercase()) {
                return false;
            }
        }
        if let Some(msg) = &self.message_contains {
            if !line.msg.to_lowercase().contains(&msg.to_lowercase()) {
                return false;
            }
        }
        match &self.scope {
            LogScope::All => true,
            LogScope::Pid { pid } => line.pid == *pid,
            LogScope::Package { pids } => pids.contains(&line.pid),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(level: char, pid: u32, tag: &str, msg: &str) -> LogLine {
        LogLine {
            seq: 0,
            ts: "01-01 00:00:00.000".into(),
            pid,
            tid: 1,
            uid: None,
            level,
            tag: tag.into(),
            msg: msg.into(),
        }
    }

    #[test]
    fn level_rank_order() {
        assert!(level_rank('V') < level_rank('D'));
        assert!(level_rank('D') < level_rank('I'));
        assert!(level_rank('I') < level_rank('W'));
        assert!(level_rank('W') < level_rank('E'));
        assert!(level_rank('E') < level_rank('F'));
        assert_eq!(level_rank('?'), 0);
    }

    #[test]
    fn filter_min_level_inclusive() {
        let f = LogFilter { min_level: Some('W'), ..Default::default() };
        assert!(f.matches(&line('W', 1, "T", "m")));
        assert!(f.matches(&line('E', 1, "T", "m")));
        assert!(!f.matches(&line('I', 1, "T", "m")));
    }

    #[test]
    fn filter_tag_message_case_insensitive() {
        let f = LogFilter {
            tag_contains: Some("okhttp".into()),
            message_contains: Some("timeout".into()),
            ..Default::default()
        };
        assert!(f.matches(&line('I', 1, "OkHttp-Async", "request Timeout")));
        assert!(!f.matches(&line('I', 1, "Other", "request Timeout")));
        assert!(!f.matches(&line('I', 1, "OkHttp", "ok")));
    }

    #[test]
    fn filter_scope_pid_and_package() {
        let exact = LogFilter { scope: LogScope::Pid { pid: 42 }, ..Default::default() };
        assert!(exact.matches(&line('I', 42, "T", "m")));
        assert!(!exact.matches(&line('I', 43, "T", "m")));

        let set = LogFilter { scope: LogScope::Package { pids: vec![42, 99] }, ..Default::default() };
        assert!(set.matches(&line('I', 99, "T", "m")));
        assert!(!set.matches(&line('I', 100, "T", "m")));

        let empty = LogFilter { scope: LogScope::Package { pids: vec![] }, ..Default::default() };
        assert!(!empty.matches(&line('I', 1, "T", "m")));
    }

    #[test]
    fn log_scope_json_internally_tagged() {
        let v = serde_json::to_value(LogScope::Package { pids: vec![1] }).unwrap();
        assert_eq!(v["kind"], "package");
        assert_eq!(v["pids"][0], 1);
    }

    #[test]
    fn raw_text_roundtrip_shape() {
        let l = line('E', 1234, "AndroidRuntime", "FATAL EXCEPTION");
        assert_eq!(l.raw_text(), "01-01 00:00:00.000  1234     1 E AndroidRuntime: FATAL EXCEPTION");
    }
}
