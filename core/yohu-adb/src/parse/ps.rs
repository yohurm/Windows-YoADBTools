//! `ps` 输出解析（进程索引：包名↔PID 映射）。

use yohu_protocol::ProcessEntry;

/// 解析 `adb shell ps -A -o PID,NAME` 输出。
///
/// 行形如：` 1234 com.example.app`；跳过表头（PID/USER 等）。
pub fn parse_ps(output: &str) -> Vec<ProcessEntry> {
    output
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }
            let mut parts = line.split_whitespace();
            let first = parts.next()?;
            if first.eq_ignore_ascii_case("PID") || first.eq_ignore_ascii_case("USER") {
                return None;
            }
            let pid: u32 = first.parse().ok()?;
            let name = parts.next()?.to_string();
            Some(ProcessEntry { pid, name })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\
PID NAME
1 init
425 surfaceflinger
1234 com.example.app
5678 com.example.app:remote
";

    #[test]
    fn parses_rows_skips_header() {
        let entries = parse_ps(SAMPLE);
        assert_eq!(entries.len(), 4);
        assert_eq!(entries[0], ProcessEntry { pid: 1, name: "init".into() });
        assert_eq!(entries[3], ProcessEntry { pid: 5678, name: "com.example.app:remote".into() });
    }

    #[test]
    fn tolerates_old_ps_without_name_column() {
        // 旧版 ps 输出（无 NAME 列）→ 全部跳过（宽容降级）
        let old = "USER PID PPID VSIZE RSS\nroot 1 0 1000 100\n";
        assert!(parse_ps(old).is_empty());
    }
}
