//! 导出服务：过滤后缓冲快照 → txt（core 持有全量缓冲，导出必须走 core）。

use std::path::{Path, PathBuf};

use crate::ring::RingBuffer;
use yovo_protocol::{ExportResult, LogFilter};

/// txt 导出器。
pub struct ExportService {
    exports_dir: PathBuf,
}

impl ExportService {
    pub fn new(exports_dir: PathBuf) -> Self {
        Self { exports_dir }
    }

    /// 导出过滤后快照为 txt；返回路径与行数。
    pub fn export(
        &self,
        serial: &str,
        ring: &RingBuffer,
        filter: Option<&LogFilter>,
        max_lines: usize,
    ) -> Result<ExportResult, std::io::Error> {
        std::fs::create_dir_all(&self.exports_dir)?;

        let lines = match filter {
            Some(f) => ring.snapshot_filtered(f, max_lines),
            None => ring.snapshot(0, max_lines),
        };

        let stamp = time::OffsetDateTime::now_local()
            .map(|t| t.format(&time::format_description::well_known::Rfc3339).unwrap_or_default())
            .unwrap_or_default();
        // 文件名安全化：时间戳含冒号/加号，替换为连字符
        let safe_stamp = stamp.replace([':', '+'], "-");
        let safe_serial: String = serial
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
            .collect();
        let name = format!("logcat-{safe_serial}-{safe_stamp}.txt");
        let path = self.exports_dir.join(name);

        let mut content = String::with_capacity(lines.len() * 96);
        for line in &lines {
            content.push_str(&line.raw_text());
            content.push('\n');
        }
        std::fs::write(&path, content)?;

        Ok(ExportResult { path: path_to_string(&path), lines: lines.len() as u64 })
    }
}

fn path_to_string(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use yovo_protocol::LogLine;

    fn line(seq: u64, level: char) -> LogLine {
        LogLine {
            seq,
            ts: "01-01 00:00:00.000".into(),
            pid: 1,
            tid: 1,
            level,
            tag: "T".into(),
            msg: "m".into(),
        }
    }

    #[test]
    fn exports_filtered_snapshot() {
        let dir = std::env::temp_dir().join(format!("yovo-export-test-{}", std::process::id()));
        let svc = ExportService::new(dir.clone());

        let ring = RingBuffer::new(100);
        ring.push(line(0, 'I'));
        ring.push(line(1, 'E'));
        ring.push(line(2, 'W'));

        let filter = LogFilter { min_level: Some('W'), ..Default::default() };
        let result = svc.export("s1", &ring, Some(&filter), 1000).unwrap();
        assert_eq!(result.lines, 2);
        let text = std::fs::read_to_string(&result.path).unwrap();
        assert!(text.contains("E T: m"));
        assert!(text.contains("W T: m"));
        assert!(!text.contains("I T: m"));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
