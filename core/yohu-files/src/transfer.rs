//! push/pull 传输引擎：节流进度 + 终态必达 + 可取消。

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::FileError;
use yohu_adb::AdbClient;
use yohu_domain::SafetyRoot;
use yohu_protocol::{AppEvent, Direction, TransferProgress, TransferState};

const PROGRESS_THROTTLE: Duration = Duration::from_millis(200);

/// 一次传输的完整规格。
#[derive(Debug, Clone)]
pub struct TransferSpec {
    pub id: u32,
    pub serial: String,
    pub direction: Direction,
    pub local: String,
    pub remote: String,
}

/// 传输引擎。
#[derive(Clone)]
pub struct TransferRunner {
    adb: Arc<AdbClient>,
    safety: SafetyRoot,
}

impl TransferRunner {
    pub fn new(adb: Arc<AdbClient>) -> Self {
        Self {
            adb,
            safety: SafetyRoot::default(),
        }
    }

    /// 执行一次传输；进度经 `sink` 以 `TransferProgress` 事件推送。
    /// `cancel` 取消传输（终止进程树）。
    pub async fn run(
        &self,
        spec: TransferSpec,
        cancel: CancellationToken,
        sink: mpsc::Sender<AppEvent>,
    ) -> Result<u64, FileError> {
        let TransferSpec {
            id,
            serial,
            direction,
            local,
            remote,
        } = spec;
        let local_path = PathBuf::from(&local);
        let remote_norm = self
            .safety
            .check_descendant(&remote)
            .map_err(|e| FileError::OutsideRoot(e.to_string()))?;

        let (argv, total): (Vec<String>, u64) = match direction {
            Direction::Push => {
                let total = push_local_total(&local_path)?;
                (
                    vec!["push".into(), local.clone(), remote_norm.as_str().into()],
                    total,
                )
            }
            Direction::Pull => (
                vec!["pull".into(), remote_norm.as_str().into(), local.clone()],
                0,
            ),
        };

        let mut progress = TransferProgress {
            id,
            direction,
            bytes: 0,
            total: (total > 0).then_some(total),
            state: TransferState::Running,
            message: None,
        };
        emit(&sink, progress.clone(), true).await;

        let (line_tx, mut line_rx) = mpsc::channel::<String>(64);
        let stream = tokio::spawn({
            let adb = Arc::clone(&self.adb);
            let cancel = cancel.clone();
            let serial = serial.to_string();
            async move { adb.stream_lines(&serial, &argv, cancel, line_tx).await }
        });

        let mut total_bytes = total;
        let mut last_summary = String::new();
        let mut last_emit = Instant::now() - PROGRESS_THROTTLE;
        while let Some(line) = line_rx.recv().await {
            last_summary = line.clone();
            if let Some(bytes) = extract_byte_count(&line) {
                total_bytes = total_bytes.max(bytes);
                progress.bytes = bytes;
                progress.total = (total_bytes > 0).then_some(total_bytes);
                if last_emit.elapsed() >= PROGRESS_THROTTLE {
                    emit(&sink, progress.clone(), false).await;
                    last_emit = Instant::now();
                }
            }
        }
        let outcome = stream
            .await
            .map_err(|e| FileError::Adb(yohu_adb::AdbError::Io(e.into())))?;

        progress.bytes = total_bytes;
        match outcome {
            Ok(code) => {
                if code == 0 {
                    progress.state = TransferState::Done;
                    emit(&sink, progress, true).await;
                    Ok(total_bytes)
                } else {
                    cleanup_pull(direction, &local_path);
                    progress.state = TransferState::Failed;
                    progress.message = Some(format!("退出码 {code}: {last_summary}"));
                    emit(&sink, progress, true).await;
                    Err(FileError::Adb(yohu_adb::AdbError::BadExit {
                        exit_code: code,
                        stderr: last_summary,
                    }))
                }
            }
            Err(yohu_adb::AdbError::Cancelled) => {
                cleanup_pull(direction, &local_path);
                progress.state = TransferState::Cancelled;
                emit(&sink, progress, true).await;
                Err(FileError::Adb(yohu_adb::AdbError::Cancelled))
            }
            Err(e) => {
                cleanup_pull(direction, &local_path);
                progress.state = TransferState::Failed;
                progress.message = Some(e.to_string());
                emit(&sink, progress, true).await;
                Err(FileError::Adb(e))
            }
        }
    }
}

async fn emit(sink: &mpsc::Sender<AppEvent>, progress: TransferProgress, reliable: bool) {
    let event = AppEvent::TransferProgress(progress);
    if reliable {
        let _ = sink.send(event).await;
    } else {
        let _ = sink.try_send(event);
    }
}

/// 文件给 `adb push` 用精确字节；目录交给 adb 递归，总数等摘要行。
fn push_local_total(path: &Path) -> Result<u64, FileError> {
    let meta = std::fs::metadata(path)
        .map_err(|_| FileError::LocalNotFound(path.display().to_string()))?;
    if meta.is_file() {
        Ok(meta.len())
    } else if meta.is_dir() {
        Ok(0)
    } else {
        Err(FileError::LocalNotFound(path.display().to_string()))
    }
}

fn cleanup_pull(direction: Direction, local: &Path) {
    if direction != Direction::Pull {
        return;
    }
    if local.is_dir() {
        let _ = std::fs::remove_dir_all(local);
    } else {
        let _ = std::fs::remove_file(local);
    }
}

/// 从 adb 摘要行提取字节数：`... (3456 bytes in 0.001s)`。
fn extract_byte_count(line: &str) -> Option<u64> {
    let start = line.find('(')? + 1;
    let end = line[start..].find(" bytes")? + start;
    line[start..end].trim().replace(',', "").parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use yohu_domain::RemotePath;

    #[test]
    fn extracts_byte_counts() {
        assert_eq!(
            extract_byte_count(
                "report.txt: 1 file pushed, 0 skipped. 1.2 MB/s (3456 bytes in 0.001s)"
            ),
            Some(3456)
        );
        assert_eq!(
            extract_byte_count("/sdcard/x: 1 file pulled, 0 skipped. (1234567 bytes in 0.2s)"),
            Some(1234567)
        );
        assert_eq!(extract_byte_count("no bytes here"), None);
    }

    #[test]
    fn remote_path_still_normalized() {
        assert!(RemotePath::parse("/sdcard//a/./b").is_ok());
        assert!(RemotePath::parse("sdcard/a").is_err());
    }

    fn unique_temp(tag: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("yohu-files-{tag}-{}-{nanos}", std::process::id()))
    }

    #[test]
    fn push_accepts_file_and_directory() {
        let root = unique_temp("push-src");
        std::fs::create_dir_all(&root).unwrap();
        let file = root.join("a.bin");
        std::fs::write(&file, b"hello").unwrap();
        let nested = root.join("folder");
        std::fs::create_dir_all(&nested).unwrap();

        assert_eq!(push_local_total(&file).unwrap(), 5);
        assert_eq!(push_local_total(&nested).unwrap(), 0);
        assert!(push_local_total(&root.join("missing")).is_err());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn cleanup_pull_removes_file_or_directory_and_ignores_push() {
        let root = unique_temp("cleanup");
        let file = root.join("partial.bin");
        let dir = root.join("partial-dir");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.txt"), b"x").unwrap();
        std::fs::write(&file, b"abc").unwrap();

        cleanup_pull(Direction::Push, &file);
        assert!(file.exists());

        cleanup_pull(Direction::Pull, &file);
        assert!(!file.exists());

        cleanup_pull(Direction::Pull, &dir);
        assert!(!dir.exists());

        let _ = std::fs::remove_dir_all(&root);
    }
}
