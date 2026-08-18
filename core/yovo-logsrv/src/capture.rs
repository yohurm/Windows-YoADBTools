//! 设备级采集：跟流、环形缓冲、进程索引、一次性 dump。
//!
//! 状态机（每 serial）：空 → Starting → Live → 空。
//! 流自然结束或 stop 都会离开 map，再次 start 必拉新流。
//! 跟流始终 `ring.clear()`；`dump_into_ring` 只追加、不跟流。

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::batch::Batcher;
use crate::parse::parse_threadtime;
use crate::ring::RingBuffer;
use yovo_adb::{AdbClient, AdbError};
use yovo_protocol::{AppEvent, CaptureState, ProcessEntry};

const LOGCAT_FORMAT: &str = "threadtime,uid";
const INDEX_INTERVAL: Duration = Duration::from_millis(2500);
const EXEC_OUT_PROBE: Duration = Duration::from_secs(2);

#[derive(Debug, thiserror::Error)]
pub enum LogError {
    #[error("该设备已在采集中")]
    AlreadyRunning,
    #[error("采集已取消")]
    Cancelled,
    #[error("采集失败: {0}")]
    Adb(#[from] AdbError),
    #[error("导出失败: {0}")]
    Io(#[from] std::io::Error),
}

struct LiveCapture {
    generation: Arc<AtomicU64>,
    cancel: CancellationToken,
    capture_handle: tokio::task::JoinHandle<()>,
    index_handle: tokio::task::JoinHandle<()>,
}

enum CaptureSlot {
    Starting {
        generation: Arc<AtomicU64>,
        cancel: CancellationToken,
    },
    Live(LiveCapture),
}

struct Inner {
    rings: HashMap<String, Arc<RingBuffer>>,
    captures: HashMap<String, CaptureSlot>,
    next_generation: u64,
}

pub struct CaptureService {
    adb: Arc<AdbClient>,
    sink: mpsc::Sender<AppEvent>,
    ring_capacity: AtomicUsize,
    inner: Mutex<Inner>,
}

fn follow_argv(exec_out: bool) -> Vec<String> {
    if exec_out {
        vec!["exec-out".into(), "logcat".into(), "-v".into(), LOGCAT_FORMAT.into()]
    } else {
        vec!["logcat".into(), "-v".into(), LOGCAT_FORMAT.into()]
    }
}

pub fn ingest_raw_lines(ring: &RingBuffer, raw_lines: impl IntoIterator<Item = impl AsRef<str>>) -> u64 {
    let mut added = 0u64;
    for raw in raw_lines {
        let raw = raw.as_ref();
        if raw.trim().is_empty() || raw.trim_start().starts_with("---------") {
            continue;
        }
        ring.push(parse_threadtime(raw));
        added += 1;
    }
    added
}

async fn run_follow(
    adb: Arc<AdbClient>,
    serial: String,
    ring: Arc<RingBuffer>,
    batcher: Batcher,
    cancel: CancellationToken,
) {
    let (line_tx, mut line_rx) = mpsc::channel::<String>(1024);
    let seen = Arc::new(AtomicU64::new(0));
    let pump_seen = Arc::clone(&seen);
    let pump = tokio::spawn(async move {
        while let Some(raw) = line_rx.recv().await {
            if raw.trim_start().starts_with("---------") {
                continue;
            }
            pump_seen.fetch_add(1, Ordering::Relaxed);
            let line = parse_threadtime(&raw);
            ring.push(line.clone());
            if batcher.feed(line).await.is_err() {
                break;
            }
        }
    });

    let probe_cancel = cancel.child_token();
    let probe = {
        let adb = Arc::clone(&adb);
        let serial = serial.clone();
        let tx = line_tx.clone();
        let token = probe_cancel.clone();
        tokio::spawn(async move { adb.stream_lines(&serial, &follow_argv(true), token, tx).await })
    };

    let deadline = tokio::time::Instant::now() + EXEC_OUT_PROBE;
    loop {
        if cancel.is_cancelled() {
            probe_cancel.cancel();
            let _ = probe.await;
            break;
        }
        if seen.load(Ordering::Relaxed) > 0 {
            let _ = probe.await;
            break;
        }
        if probe.is_finished() {
            let _ = probe.await;
            if seen.load(Ordering::Relaxed) == 0 && !cancel.is_cancelled() {
                tracing::warn!("exec-out logcat 未产出，回退 adb logcat");
                let _ = adb
                    .stream_lines(&serial, &follow_argv(false), cancel.clone(), line_tx.clone())
                    .await;
            }
            break;
        }
        if tokio::time::Instant::now() >= deadline {
            probe_cancel.cancel();
            let _ = probe.await;
            if seen.load(Ordering::Relaxed) == 0 && !cancel.is_cancelled() {
                tracing::warn!("exec-out logcat 超时无行，回退 adb logcat");
                let _ = adb
                    .stream_lines(&serial, &follow_argv(false), cancel.clone(), line_tx.clone())
                    .await;
            }
            break;
        }
        tokio::select! {
            biased;
            _ = cancel.cancelled() => {
                probe_cancel.cancel();
                let _ = probe.await;
                break;
            }
            _ = tokio::time::sleep(Duration::from_millis(40)) => {}
        }
    }

    drop(line_tx);
    let _ = pump.await;
}

impl CaptureService {
    pub fn new(adb: Arc<AdbClient>, sink: mpsc::Sender<AppEvent>, ring_capacity: usize) -> Arc<Self> {
        Arc::new(Self {
            adb,
            sink,
            ring_capacity: AtomicUsize::new(ring_capacity.max(1)),
            inner: Mutex::new(Inner {
                rings: HashMap::new(),
                captures: HashMap::new(),
                next_generation: 0,
            }),
        })
    }

    pub fn set_ring_capacity(&self, capacity: usize) {
        self.ring_capacity.store(capacity.max(1), Ordering::Relaxed);
    }

    pub fn ring(self: &Arc<Self>, serial: &str) -> Arc<RingBuffer> {
        let cap = self.ring_capacity.load(Ordering::Relaxed);
        let mut inner = self.inner.lock().expect("capture lock poisoned");
        inner
            .rings
            .entry(serial.to_string())
            .or_insert_with(|| Arc::new(RingBuffer::new(cap)))
            .clone()
    }

    /// 开始跟流。已在 Starting/Live 则 AlreadyRunning。跟流前清空本设备环。
    pub async fn start(self: &Arc<Self>, serial: &str, clear_device: bool) -> Result<(), LogError> {
        let cancel = CancellationToken::new();
        let generation = {
            let mut inner = self.inner.lock().expect("capture lock poisoned");
            if inner.captures.contains_key(serial) {
                return Err(LogError::AlreadyRunning);
            }
            inner.next_generation += 1;
            let generation = Arc::new(AtomicU64::new(inner.next_generation));
            inner.captures.insert(
                serial.to_string(),
                CaptureSlot::Starting { generation: Arc::clone(&generation), cancel: cancel.clone() },
            );
            generation
        };
        let my_generation = generation.load(Ordering::Relaxed);

        if clear_device {
            if let Err(e) = self.adb.clear_log(serial, cancel.clone()).await {
                tracing::warn!("logcat -c 失败，继续采集: {e}");
            }
        }
        if cancel.is_cancelled() {
            self.abandon_starting(serial, my_generation);
            return Err(LogError::Cancelled);
        }

        let ring = self.ring(serial);
        ring.set_capacity(self.ring_capacity.load(Ordering::Relaxed));
        ring.clear();
        let (batcher, _batch_handle) = Batcher::spawn(
            serial.to_string(),
            self.sink.clone(),
            Duration::from_millis(150),
            1000,
            512 * 1024,
            cancel.clone(),
        );

        let adb = Arc::clone(&self.adb);
        let service = Arc::clone(self);
        let serial_owned = serial.to_string();
        let follow_cancel = cancel.clone();
        let capture_handle = tokio::spawn(async move {
            run_follow(adb, serial_owned.clone(), ring, batcher, follow_cancel).await;
            service.release_if_current(&serial_owned, my_generation);
        });

        let index_handle = tokio::spawn(crate::index::run(
            serial.to_string(),
            Arc::clone(&self.adb),
            self.sink.clone(),
            INDEX_INTERVAL,
            cancel.clone(),
        ));

        let published = {
            let mut inner = self.inner.lock().expect("capture lock poisoned");
            let can_publish = matches!(
                inner.captures.get(serial),
                Some(CaptureSlot::Starting { generation: g, .. })
                    if g.load(Ordering::Relaxed) == my_generation
            );
            if can_publish {
                inner.captures.insert(
                    serial.to_string(),
                    CaptureSlot::Live(LiveCapture {
                        generation,
                        cancel,
                        capture_handle,
                        index_handle,
                    }),
                );
                true
            } else {
                cancel.cancel();
                false
            }
        };

        if !published {
            return Err(LogError::Cancelled);
        }
        let _ = self.sink.try_send(AppEvent::CaptureState {
            serial: serial.to_string(),
            state: CaptureState::Running,
        });
        Ok(())
    }

    pub async fn stop(&self, serial: &str) {
        let taken = {
            let mut inner = self.inner.lock().expect("capture lock poisoned");
            inner.captures.remove(serial)
        };
        let Some(slot) = taken else {
            return;
        };
        match slot {
            CaptureSlot::Starting { generation, cancel } => {
                generation.fetch_add(1, Ordering::Relaxed);
                cancel.cancel();
            }
            CaptureSlot::Live(cap) => {
                cap.generation.fetch_add(1, Ordering::Relaxed);
                cap.cancel.cancel();
                let _ = cap.capture_handle.await;
                let _ = cap.index_handle.await;
            }
        }
        let _ = self.sink.try_send(AppEvent::CaptureState {
            serial: serial.to_string(),
            state: CaptureState::Stopped,
        });
    }

    pub fn is_capturing(&self, serial: &str) -> bool {
        let inner = self.inner.lock().expect("capture lock poisoned");
        inner.captures.contains_key(serial)
    }

    pub fn clear(&self, serial: &str) {
        let inner = self.inner.lock().expect("capture lock poisoned");
        if let Some(ring) = inner.rings.get(serial) {
            ring.clear();
        }
    }

    pub async fn clear_device_buffer(&self, serial: &str) -> Result<(), LogError> {
        self.adb.clear_log(serial, CancellationToken::new()).await?;
        self.clear(serial);
        Ok(())
    }

    pub async fn detach_device(&self, serial: &str) {
        self.stop(serial).await;
        self.clear(serial);
    }

    pub async fn process_snapshot(&self, serial: &str) -> Result<Vec<ProcessEntry>, LogError> {
        Ok(self.adb.ps(serial, CancellationToken::new()).await?)
    }

    /// 一次性 `logcat -d` 写入环。不跟流、不清环、不推批次。
    pub async fn dump_into_ring(self: &Arc<Self>, serial: &str) -> Result<u64, LogError> {
        let raw = self.adb.dump_log(serial, CancellationToken::new()).await?;
        Ok(ingest_raw_lines(&self.ring(serial), raw))
    }

    fn abandon_starting(&self, serial: &str, generation: u64) {
        let mut inner = self.inner.lock().expect("capture lock poisoned");
        let drop = match inner.captures.get(serial) {
            Some(CaptureSlot::Starting { generation: g, .. }) => g.load(Ordering::Relaxed) == generation,
            _ => false,
        };
        if drop {
            inner.captures.remove(serial);
        }
    }

    fn release_if_current(&self, serial: &str, generation: u64) {
        let taken = {
            let mut inner = self.inner.lock().expect("capture lock poisoned");
            match inner.captures.get(serial) {
                Some(CaptureSlot::Live(cap)) if cap.generation.load(Ordering::Relaxed) == generation => {
                    inner.captures.remove(serial)
                }
                Some(CaptureSlot::Starting { generation: g, .. }) if g.load(Ordering::Relaxed) == generation => {
                    inner.captures.remove(serial)
                }
                _ => None,
            }
        };
        if let Some(slot) = taken {
            match slot {
                CaptureSlot::Live(cap) => cap.cancel.cancel(),
                CaptureSlot::Starting { cancel, .. } => cancel.cancel(),
            }
            let _ = self.sink.try_send(AppEvent::CaptureState {
                serial: serial.to_string(),
                state: CaptureState::Stopped,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ingest_skips_headers_and_parses_threadtime() {
        let ring = RingBuffer::new(16);
        let added = ingest_raw_lines(
            &ring,
            [
                "--------- beginning of main",
                "",
                "01-02 03:04:05.678  1234  5678 I TestTag: hello",
                "01-02 03:04:05.779  1000  1234  5678 W TestTag: uid-col",
            ],
        );
        assert_eq!(added, 2);
        assert_eq!(ring.len(), 2);
        let snap = ring.snapshot(0, 10);
        assert_eq!(snap[0].pid, 1234);
        assert_eq!(snap[0].uid, None);
        assert_eq!(snap[1].pid, 1234);
        assert_eq!(snap[1].uid, Some(1000));
        assert_eq!(snap[1].level, 'W');
    }
}
