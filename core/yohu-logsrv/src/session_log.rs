//! 实时逐窗口日志文件服务（日志写入方式：覆盖 / 续写）。
//!
//! 边界：core 只负责把「UI 已过滤的行」写入磁盘；过滤仍是 UI 消费端职责（ADR-v6-006）。
//! 文件累积不受 RingBuffer 容量约束 → 导出/记录完整。写入方式由 [`LogWriteMode`] 决定：
//! - `Overwrite`：固定文件名 `{serial}-w{window_id}.log`，下次任务截断重写；
//! - `Append`：每次任务各开一个新文件 `{serial}-w{window_id}-{stamp}.log`，旧文件保留。

use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use yohu_protocol::{ExportResult, LogLine, LogWriteMode, SessionFileInfo, SessionLogFile};

struct WindowFile {
    path: PathBuf,
    handle: Option<File>,
    /// 已写入的最大 seq；None = 尚未写入任何行（seq 可为 0）
    last_seq: Option<u64>,
    lines: u64,
}

/// 逐窗口实时日志文件服务（每设备可多窗口，各窗独立文件）。
pub struct SessionLogService {
    root: PathBuf,
    windows: Mutex<HashMap<(String, u32), WindowFile>>,
}

fn safe(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '-'
            }
        })
        .collect()
}

fn stamp() -> String {
    let now = time::OffsetDateTime::now_local()
        .map(|t| {
            t.format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_default()
        })
        .unwrap_or_default();
    now.replace([':', '+'], "-")
}

impl SessionLogService {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            windows: Mutex::new(HashMap::new()),
        }
    }

    fn key(serial: &str, window_id: u32) -> (String, u32) {
        (serial.to_string(), window_id)
    }

    /// 打开某窗口的实时日志文件；返回路径与已写入行数。
    pub fn open(
        &self,
        serial: &str,
        window_id: u32,
        name: &str,
        mode: LogWriteMode,
    ) -> io::Result<SessionFileInfo> {
        fs::create_dir_all(&self.root)?;
        let safe_serial = safe(serial);
        // 窗口名并入文件名（统一数据源）：`{serial}-{name}-w{windowId}[-stamp].log`。
        // 名称必须非空（默认包名/PID/System）；空则回退到 windowId 段。
        let name_seg = {
            let n = safe(name);
            if n.is_empty() {
                format!("w{window_id}")
            } else {
                n
            }
        };
        let path = if mode == LogWriteMode::Overwrite {
            self.root
                .join(format!("{safe_serial}-{name_seg}-w{window_id}.log"))
        } else {
            // 续写：每次任务新开一个文件，避免覆盖上次；时间戳冲突则再加后缀
            let base = format!("{safe_serial}-{name_seg}-w{window_id}-{}.log", stamp());
            let mut path = self.root.join(&base);
            let mut n = 1;
            while path.exists() {
                path = self.root.join(format!(
                    "{safe_serial}-{name_seg}-w{window_id}-{}-{n}.log",
                    stamp()
                ));
                n += 1;
            }
            path
        };

        let handle = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&path)?;

        let wf = WindowFile {
            path: path.clone(),
            handle: Some(handle),
            last_seq: None,
            lines: 0,
        };
        self.windows
            .lock()
            .expect("session_log lock poisoned")
            .insert(Self::key(serial, window_id), wf);

        Ok(SessionFileInfo {
            path: path_string(&path),
            name: name.to_string(),
            lines: 0,
        })
    }

    /// 追加一批 UI 已过滤行；按 seq 单调去重（容忍乱序重放）。
    pub fn append(&self, serial: &str, window_id: u32, lines: &[LogLine]) -> io::Result<u64> {
        let mut map = self.windows.lock().expect("session_log lock poisoned");
        let wf = map
            .get_mut(&Self::key(serial, window_id))
            .ok_or_else(|| io::Error::other("窗口日志文件未打开"))?;
        let mut buf = String::new();
        let mut count = 0u64;
        let mut last = wf.last_seq;
        for line in lines {
            if let Some(l) = last {
                if line.seq <= l {
                    continue;
                }
            }
            last = Some(line.seq);
            buf.push_str(&line.raw_text());
            buf.push('\n');
            count += 1;
        }
        wf.last_seq = last;
        wf.lines += count;
        if let Some(handle) = wf.handle.as_mut() {
            handle.write_all(buf.as_bytes())?;
            handle.flush()?;
        }
        Ok(count)
    }

    /// 结束某窗口日志文件（关闭句柄并移除条目）。
    pub fn close(&self, serial: &str, window_id: u32) -> io::Result<PathBuf> {
        let mut map = self.windows.lock().expect("session_log lock poisoned");
        if let Some(wf) = map.remove(&Self::key(serial, window_id)) {
            let path = wf.path.clone();
            // 关闭句柄（删除时 drop 会落盘刷出，但我们显式 flush 一次）
            if let Some(mut handle) = wf.handle {
                handle.flush()?;
            }
            Ok(path)
        } else {
            Err(io::Error::other("窗口日志文件未打开"))
        }
    }

    /// 当前窗口最新文件路径（导出「最新」用）；未打开时兜底取磁盘上该窗口最新文件。
    pub fn latest(&self, serial: &str, window_id: u32) -> Option<PathBuf> {
        if let Some(wf) = self
            .windows
            .lock()
            .expect("session_log lock poisoned")
            .get(&Self::key(serial, window_id))
        {
            return Some(wf.path.clone());
        }
        self.list()
            .ok()?
            .into_iter()
            .filter(|f| f.serial == serial && f.window_id == window_id)
            .max_by(|a, b| a.modified.cmp(&b.modified))
            .map(|f| PathBuf::from(f.path))
    }

    /// 列出全部窗口日志文件（多选导出对话框用）：路径 / 行数 / 修改时间。
    pub fn list(&self) -> io::Result<Vec<SessionLogFile>> {
        let mut out = Vec::new();
        if !self.root.exists() {
            return Ok(out);
        }
        for entry in fs::read_dir(&self.root)? {
            let entry = entry?;
            if entry.file_type()?.is_dir() {
                continue;
            }
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            if !name.ends_with(".log") {
                continue;
            }
            let lines = count_line_breaks(&fs::read(&path)?);
            let (serial, disp, window_id) =
                parse_parts(&name).unwrap_or_else(|| (name.clone(), String::new(), 0));
            let modified = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(system_time_iso::format)
                .unwrap_or_default();
            out.push(SessionLogFile {
                path: path_string(&path),
                serial,
                window_id,
                name: disp,
                lines,
                modified,
            });
        }
        out.sort_by(|a, b| a.modified.cmp(&b.modified));
        Ok(out)
    }

    /// 把选定源文件合并导出为一份 txt；`dest` 为空写入本目录时间戳文件。
    pub fn export(&self, sources: &[String], dest: Option<&Path>) -> io::Result<ExportResult> {
        fs::create_dir_all(&self.root)?;
        let path = match dest {
            Some(p) if !p.as_os_str().is_empty() => {
                if let Some(parent) = p.parent() {
                    if !parent.as_os_str().is_empty() {
                        fs::create_dir_all(parent)?;
                    }
                }
                p.to_path_buf()
            }
            _ => self.root.join(format!("logcat-export-{}.txt", stamp())),
        };
        let mut content = String::new();
        let mut lines = 0u64;
        for src in sources {
            let data = fs::read(src)?;
            lines += count_line_breaks(&data) as u64;
            content.push_str(&String::from_utf8_lossy(&data));
            if !content.ends_with('\n') {
                content.push('\n');
            }
        }
        fs::write(&path, content)?;
        Ok(ExportResult {
            path: path_string(&path),
            lines,
        })
    }
}

/// 从 `{serial}-{name}-w{windowId}[-stamp].log` 解析出 (serial, 窗口名, windowId)。
/// `-w{windowId}` 作为稳定分隔符取最右；serial 无 `-`，首个 `-` 后为窗口名。
fn parse_parts(filename: &str) -> Option<(String, String, u32)> {
    let base = filename.strip_suffix(".log")?;
    let wpos = base.rfind("-w")?;
    let head = &base[..wpos]; // `<serial>-<name>`
    let tail = &base[wpos + 2..]; // `<windowId>[-<stamp>]`
    let digits: String = tail.chars().take_while(|c| c.is_ascii_digit()).collect();
    let window_id: u32 = digits.parse().ok()?;
    let serial = head.split('-').next()?.to_string();
    let name = if head.len() > serial.len() + 1 {
        head[serial.len() + 1..].to_string()
    } else {
        String::new()
    };
    Some((serial, name, window_id))
}

fn count_line_breaks(data: &[u8]) -> u64 {
    data.iter().filter(|&&b| b == b'\n').count() as u64
}

fn path_string(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

/// 把系统时间格式化为 ISO-8601 便于排序/展示（避免直接把 SystemTime 传进 DTO）。
mod system_time_iso {
    use std::time::SystemTime;
    pub fn format(t: SystemTime) -> Option<String> {
        let dt: time::OffsetDateTime = t.into();
        Some(
            dt.format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_default(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(seq: u64) -> LogLine {
        LogLine {
            seq,
            ts: "01-01 00:00:00.000".into(),
            pid: 1,
            tid: 1,
            uid: None,
            level: 'I',
            tag: "T".into(),
            msg: format!("m{seq}"),
        }
    }

    fn temp_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("yohu-slog-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        root
    }

    #[test]
    fn overwrite_uses_fixed_name_and_truncates() {
        let root = temp_root("overwrite");
        let svc = SessionLogService::new(root.clone());
        let a = svc.open("S1", 1, "System", LogWriteMode::Overwrite).unwrap();
        assert!(a.path.ends_with("S1-System-w1.log"));
        svc.append("S1", 1, &[line(0), line(1)]).unwrap();
        svc.close("S1", 1).unwrap();

        // 再次 open（新任务）→ 固定名，截断
        svc.open("S1", 1, "System", LogWriteMode::Overwrite).unwrap();
        svc.append("S1", 1, &[line(2)]).unwrap();
        svc.close("S1", 1).unwrap();
        let text = std::fs::read_to_string(root.join("S1-System-w1.log")).unwrap();
        assert_eq!(text.matches("\n").count(), 1, "覆盖应只剩新任务 1 行");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn append_opens_new_file_per_task() {
        let root = temp_root("append");
        let svc = SessionLogService::new(root.clone());
        let a = svc.open("S1", 1, "System", LogWriteMode::Append).unwrap();
        svc.append("S1", 1, &[line(0)]).unwrap();
        svc.close("S1", 1).unwrap();
        let b = svc.open("S1", 1, "System", LogWriteMode::Append).unwrap();
        assert_ne!(a.path, b.path, "续写应每次新开文件");
        svc.append("S1", 1, &[line(1)]).unwrap();
        svc.close("S1", 1).unwrap();
        let files: Vec<_> = std::fs::read_dir(&root).unwrap().collect();
        assert_eq!(files.len(), 2, "两次续写应保留 2 个文件");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn append_dedupes_by_seq() {
        let root = temp_root("dedup");
        let svc = SessionLogService::new(root.clone());
        svc.open("S1", 1, "System", LogWriteMode::Overwrite).unwrap();
        svc.append("S1", 1, &[line(0), line(1)]).unwrap();
        svc.append("S1", 1, &[line(1), line(2)]).unwrap();
        svc.close("S1", 1).unwrap();
        let text = std::fs::read_to_string(root.join("S1-System-w1.log")).unwrap();
        assert_eq!(text.matches("\n").count(), 3);
        assert!(!text.contains("m1\nm1"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn lists_and_exports_merge() {
        let root = temp_root("merge");
        let svc = SessionLogService::new(root.clone());
        svc.open("S1", 1, "System", LogWriteMode::Overwrite).unwrap();
        svc.append("S1", 1, &[line(0), line(1)]).unwrap();
        svc.close("S1", 1).unwrap();
        svc.open("S1", 2, "com.example.app", LogWriteMode::Overwrite).unwrap();
        svc.append("S1", 2, &[line(5)]).unwrap();
        svc.close("S1", 2).unwrap();

        let listed = svc.list().unwrap();
        assert_eq!(listed.len(), 2);
        assert!(listed.iter().any(|f| f.name == "System"));
        assert!(listed.iter().any(|f| f.name == "com.example.app"));

        let srcs: Vec<String> = listed.iter().map(|f| f.path.clone()).collect();
        let out = root.join("merged.txt");
        let res = svc.export(&srcs, Some(&out)).unwrap();
        assert_eq!(res.lines, 3);
        let text = std::fs::read_to_string(&out).unwrap();
        assert!(text.contains("m0") && text.contains("m1") && text.contains("m5"));
        let _ = std::fs::remove_dir_all(&root);
    }
}
