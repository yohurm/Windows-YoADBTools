//! 日志过滤匹配（ADR-v6-006）：wire [`LogFilter`] 的领域语义。
//!
//! protocol 只持有结构；导出/回补与 UI `matchesWireFilter` 共用本层 + testdata/log_filter.json。

use yohu_protocol::{LogFilter, LogLine, LogScope};

/// 级别序：V < D < I < W < E < F；未知为 0（低于任意已知级别）。
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

/// ASCII 忽略大小写的子串匹配（ADR-v6-006：Tag/关键字 = OrdinalIgnoreCase）。
/// 用字节级 `eq_ignore_ascii_case`，避免 Unicode `to_lowercase()` 对非 ASCII 的语义偏差。
fn contains_ascii_ignore_case(haystack: &str, needle: &str) -> bool {
    let h = haystack.as_bytes();
    let n = needle.as_bytes();
    if n.is_empty() {
        return true;
    }
    if n.len() > h.len() {
        return false;
    }
    h.windows(n.len())
        .any(|w| w.iter().zip(n).all(|(a, b)| a.eq_ignore_ascii_case(b)))
}

/// 单行匹配。`Package { pids: [] }` 不命中任何行。
pub fn log_filter_matches(filter: &LogFilter, line: &LogLine) -> bool {
    if let Some(min) = filter.min_level {
        if level_rank(line.level) < level_rank(min) {
            return false;
        }
    }
    if let Some(tag) = &filter.tag_contains {
        if !contains_ascii_ignore_case(&line.tag, tag) {
            return false;
        }
    }
    if let Some(msg) = &filter.message_contains {
        if !contains_ascii_ignore_case(&line.msg, msg) {
            return false;
        }
    }
    match &filter.scope {
        LogScope::All => true,
        LogScope::Pid { pid } => line.pid == *pid,
        LogScope::Package { pids } => pids.contains(&line.pid),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use yohu_protocol::LogLine;

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
    fn matches_shared_fixture() {
        #[derive(serde::Deserialize)]
        struct Case {
            line: LogLine,
            filter: LogFilter,
            expect: bool,
        }
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../testdata/log_filter.json")).expect("fixture");
        for (i, case) in cases.iter().enumerate() {
            assert_eq!(
                log_filter_matches(&case.filter, &case.line),
                case.expect,
                "case {i}"
            );
        }
    }
}
