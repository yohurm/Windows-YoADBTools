//! `ls -la` 输出解析（设备文件浏览）。

use yovo_protocol::{EntryKind, RemoteEntry};

/// 解析 `adb shell ls -la <dir>` 输出。
///
/// 行形如：`drwxr-xr-x 2 root root 4096 2026-01-01 12:00 DCIM`
/// 符号链接：`lrwxrwxrwx 1 root root 12 2026-01-01 12:00 link -> /sdcard/x`
/// 宽容解析：跳过 `total` 行、`.`/`..`、无法识别的行。
pub fn parse_ls(output: &str) -> Vec<RemoteEntry> {
    output
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with("total ") {
                return None;
            }
            // 符号链接拆分："name -> target"
            let (head, link_target) = match line.split_once(" -> ") {
                Some((h, t)) => (h, Some(t.trim().to_string())),
                None => (line, None),
            };
            let mut fields = head.split_whitespace();
            let mode = fields.next()?;
            let kind = match mode.chars().next() {
                Some('d') => EntryKind::Dir,
                Some('l') => EntryKind::Symlink,
                Some('-') => EntryKind::File,
                _ => EntryKind::Other,
            };
            // count owner group size
            fields.next()?;
            fields.next()?;
            fields.next()?;
            let size: u64 = fields.next()?.parse().ok()?;
            // 日期 时间（两列）
            fields.next()?;
            fields.next()?;
            let name = fields.collect::<Vec<_>>().join(" ");
            if name.is_empty() || name == "." || name == ".." {
                return None;
            }
            Some(RemoteEntry {
                name,
                kind,
                size,
                permission: mode.to_string(),
                link_target,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\
total 84
drwxr-xr-x 2 root root 4096 2026-01-01 12:00 Alarms
-rw-rw---- 1 root sdcard_rw 12345 2026-01-02 08:30 report.txt
lrwxrwxrwx 1 root root 12 2026-01-03 09:00 data -> /sdcard/DCIM
";

    #[test]
    fn parses_entries_and_skips_total() {
        let entries = parse_ls(SAMPLE);
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].name, "Alarms");
        assert_eq!(entries[0].kind, EntryKind::Dir);
        assert_eq!(entries[0].size, 4096);
        assert_eq!(entries[1].kind, EntryKind::File);
        assert_eq!(entries[1].size, 12345);
        assert_eq!(entries[2].kind, EntryKind::Symlink);
        assert_eq!(entries[2].link_target.as_deref(), Some("/sdcard/DCIM"));
    }

    #[test]
    fn skips_dot_entries_and_garbage() {
        let out = "total 0\n. .\ndrwxr-xr-x 2 root root 0 2026-01-01 00:00 ..\nnot a valid line\n";
        assert!(parse_ls(out).is_empty());
    }

    #[test]
    fn name_with_spaces() {
        let out = "-rw-rw---- 1 root root 10 2026-01-01 00:00 my file.txt\n";
        let entries = parse_ls(out);
        assert_eq!(entries[0].name, "my file.txt");
    }
}
