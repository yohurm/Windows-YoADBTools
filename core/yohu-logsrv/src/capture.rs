//! 设备级采集：跟流、环形缓冲、进程索引、一次性 dump。
//!
//! 状态机（每 serial）：空 → Starting(gen) → Live(gen) → Stopping(gen) → 空。
//! start 仅对 Live **adopt**；Starting/Stopping 等待后再决定。新流才 `ring.clear()`。
//! 控制面 `CaptureState` 带 generation 且 `send().await` 必达；批次仍 `try_send`。
//! 跟流始终 `ring.clear()`；`dump_into_ring` 只追加、不跟流。

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::sync::{mpsc, Notify};
use tokio_util::sync::CancellationToken;

use crate::batch::Batcher;
use crate::parse::parse_threadtime;
use crate::ring::RingBuffer;
use yohu_adb::{AdbClient, AdbError};
use yohu_protocol::{AppEvent, CaptureStart, CaptureState, CaptureStatus, ProcessEntry};

const LOGCAT_FORMAT: &str = "threadtime,uid";
const INDEX_INTERVAL: Duration = Duration::from_millis(2500);
const EXEC_OUT_PROBE: Duration = Duration::from_secs(2);

#[derive(Debug, thiserror::Error)]
pub enum LogError {
    #[error("采集已取消")]
    Cancelled,
    #[error("采集失败: {0}")]
    Adb(#[from] AdbError),
    #[error("导出失败: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Phase {
    Starting,
    Live,
    Stopping,
}

struct CaptureSlot {
    generation: u64,
    phase: Phase,
    cancel: CancellationToken,
    capture_handle: Option<tokio::task::JoinHandle<()>>,
    index_handle: Option<tokio::task::JoinHandle<()>>,
}

struct Inner {
    rings: HashMap<String, Arc<RingBuffer>>,
    captures: HashMap<String, CaptureSlot>,
    last_generation: HashMap<String, u64>,
    next_generation: u64,
}

enum StartDecision {
    Adopt(CaptureStart),
    Begin { generation: u64, cancel: CancellationToken },
    Wait,
}

fn remember_and_remove(inner: &mut Inner, serial: &str) -> Option<CaptureSlot> {
    let slot = inner.captures.remove(serial)?;
    inner.last_generation.insert(serial.to_string(), slot.generation);
    Some(slot)
}

pub struct CaptureService {
    adb: Arc<AdbClient>,
    sink: mpsc::Sender<AppEvent>,
    ring_capacity: AtomicUsize,
    inner: Mutex<Inner>,
    changed: Notify,
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
                last_generation: HashMap::new(),
                next_generation: 0,
            }),
            changed: Notify::new(),
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

    pub fn status(&self, serial: &str) -> CaptureStatus {
        let inner = self.inner.lock().expect("capture lock poisoned");
        let (capturing, generation) = match inner.captures.get(serial) {
            Some(slot) if slot.phase == Phase::Starting || slot.phase == Phase::Live => {
                (true, slot.generation)
            }
            Some(slot) => (false, slot.generation),
            None => (
                false,
                inner.last_generation.get(serial).copied().unwrap_or(0),
            ),
        };
        let last_seq = inner.rings.get(serial).map(|r| r.last_seq()).unwrap_or(0);
        CaptureStatus {
            serial: serial.to_string(),
            capturing,
            generation,
            last_seq,
        }
    }

    fn decide_start(&self, serial: &str) -> StartDecision {
        let mut inner = self.inner.lock().expect("capture lock poisoned");
        match inner.captures.get(serial) {
            Some(slot) if slot.phase == Phase::Live => {
                StartDecision::Adopt(CaptureStart {
                    serial: serial.to_string(),
                    generation: slot.generation,
                    adopted: true,
                })
            }
            Some(_) => StartDecision::Wait,
            None => {
                inner.next_generation += 1;
                let generation = inner.next_generation;
                let cancel = CancellationToken::new();
                inner.captures.insert(
                    serial.to_string(),
                    CaptureSlot {
                        generation,
                        phase: Phase::Starting,
                        cancel: cancel.clone(),
                        capture_handle: None,
                        index_handle: None,
                    },
                );
                StartDecision::Begin { generation, cancel }
            }
        }
    }

    fn start_must_wait(&self, serial: &str) -> bool {
        let inner = self.inner.lock().expect("capture lock poisoned");
        matches!(
            inner.captures.get(serial),
            Some(slot) if slot.phase == Phase::Starting || slot.phase == Phase::Stopping
        )
    }

    /// 开始跟流。仅 Live 可 adopt。Starting/Stopping 等待后再决定。新流跟流前清空本设备环。
    pub async fn start(self: &Arc<Self>, serial: &str, clear_device: bool) -> Result<CaptureStart, LogError> {
        let (my_generation, cancel) = loop {
            match self.decide_start(serial) {
                StartDecision::Adopt(result) => {
                    tracing::info!(
                        serial,
                        generation = result.generation,
                        "采集 adopt（已在 Live）"
                    );
                    return Ok(result);
                }
                StartDecision::Begin { generation, cancel } => {
                    self.changed.notify_waiters();
                    break (generation, cancel);
                }
                StartDecision::Wait => {
                    let notified = self.changed.notified();
                    if self.start_must_wait(serial) {
                        notified.await;
                    }
                }
            }
        };

        if clear_device {
            if let Err(e) = self.adb.clear_log(serial, cancel.clone()).await {
                tracing::warn!("logcat -c 失败，继续采集: {e}");
            }
        }
        if cancel.is_cancelled() {
            self.abandon_starting(serial, my_generation).await;
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
            service.release_if_current(&serial_owned, my_generation).await;
        });

        let index_handle = tokio::spawn(crate::index::run(
            serial.to_string(),
            Arc::clone(&self.adb),
            self.sink.clone(),
            INDEX_INTERVAL,
            cancel.clone(),
        ));

        let mut capture_handle = Some(capture_handle);
        let mut index_handle = Some(index_handle);
        let published = {
            let mut inner = self.inner.lock().expect("capture lock poisoned");
            match inner.captures.get_mut(serial) {
                Some(slot)
                    if slot.generation == my_generation && slot.phase == Phase::Starting =>
                {
                    slot.phase = Phase::Live;
                    slot.capture_handle = capture_handle.take();
                    slot.index_handle = index_handle.take();
                    true
                }
                _ => false,
            }
        };

        if !published {
            cancel.cancel();
            if let Some(handle) = capture_handle {
                let _ = handle.await;
            }
            if let Some(handle) = index_handle {
                let _ = handle.await;
            }
            return Err(LogError::Cancelled);
        }
        self.emit_state(serial, my_generation, CaptureState::Running).await;
        self.changed.notify_waiters();
        tracing::info!(serial, generation = my_generation, "采集开始");
        Ok(CaptureStart {
            serial: serial.to_string(),
            generation: my_generation,
            adopted: false,
        })
    }

    pub async fn stop(&self, serial: &str) {
        let (generation, cap_h, idx_h) = loop {
            let wait = {
                let mut inner = self.inner.lock().expect("capture lock poisoned");
                match inner.captures.get_mut(serial) {
                    None => return,
                    Some(slot) if slot.phase == Phase::Stopping => true,
                    Some(slot) => {
                        slot.phase = Phase::Stopping;
                        slot.cancel.cancel();
                        break (
                            slot.generation,
                            slot.capture_handle.take(),
                            slot.index_handle.take(),
                        );
                    }
                }
            };
            if wait {
                let notified = self.changed.notified();
                let still_stopping = {
                    let inner = self.inner.lock().expect("capture lock poisoned");
                    matches!(
                        inner.captures.get(serial),
                        Some(slot) if slot.phase == Phase::Stopping
                    )
                };
                if still_stopping {
                    notified.await;
                }
            }
        };
        self.changed.notify_waiters();

        if let Some(handle) = cap_h {
            let _ = handle.await;
        }
        if let Some(handle) = idx_h {
            let _ = handle.await;
        }

        let emit = {
            let mut inner = self.inner.lock().expect("capture lock poisoned");
            let matches = inner.captures.get(serial).is_some_and(|slot| {
                slot.generation == generation && slot.phase == Phase::Stopping
            });
            if matches {
                let _ = remember_and_remove(&mut inner, serial);
                true
            } else {
                false
            }
        };
        if emit {
            self.emit_state(serial, generation, CaptureState::Stopped).await;
            tracing::info!(serial, generation, "采集停止");
        } else {
            tracing::info!(serial, generation, "采集停止被更新世代取代，丢弃 Stopped");
        }
        self.changed.notify_waiters();
    }

    pub fn is_capturing(&self, serial: &str) -> bool {
        self.status(serial).capturing
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

    async fn emit_state(&self, serial: &str, generation: u64, state: CaptureState) {
        let _ = self
            .sink
            .send(AppEvent::CaptureState {
                serial: serial.to_string(),
                generation,
                state,
            })
            .await;
    }

    async fn abandon_starting(&self, serial: &str, generation: u64) {
        let dropped = {
            let mut inner = self.inner.lock().expect("capture lock poisoned");
            let matches = inner.captures.get(serial).is_some_and(|slot| {
                slot.generation == generation && slot.phase == Phase::Starting
            });
            if matches {
                let _ = remember_and_remove(&mut inner, serial);
                true
            } else {
                false
            }
        };
        if dropped {
            self.emit_state(serial, generation, CaptureState::Stopped).await;
            tracing::info!(serial, generation, "采集 Starting 已放弃");
            self.changed.notify_waiters();
        }
    }

    async fn release_if_current(&self, serial: &str, generation: u64) {
        let taken = {
            let mut inner = self.inner.lock().expect("capture lock poisoned");
            let matches = inner.captures.get(serial).is_some_and(|slot| {
                slot.generation == generation
                    && (slot.phase == Phase::Live || slot.phase == Phase::Starting)
            });
            if matches {
                remember_and_remove(&mut inner, serial)
            } else {
                None
            }
        };
        if let Some(slot) = taken {
            slot.cancel.cancel();
            self.emit_state(serial, generation, CaptureState::Stopped).await;
            tracing::info!(serial, generation, "采集流结束");
            self.changed.notify_waiters();
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
        assert_eq!(snap[1].uid.as_deref(), Some("1000"));
        assert_eq!(snap[1].level, 'W');
    }
}
