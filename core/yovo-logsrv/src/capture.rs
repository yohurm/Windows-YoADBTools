//! 采集服务（ADR-v6-006）：每设备至多一路 logcat 流 + 共享环形缓冲。
//!
//! - Start 幂等（已采集中 → AlreadyRunning）
//! - 世代 token 防旧流迟到写入
//! - 掉线/切换：app 层调用 `stop()` + `clear()`

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::batch::Batcher;
use crate::parse::parse_threadtime;
use crate::ring::RingBuffer;
use yovo_adb::{AdbClient, AdbError};
use yovo_protocol::{AppEvent, CaptureState};

/// 采集服务错误。
#[derive(Debug, thiserror::Error)]
pub enum LogError {
    #[error("该设备已在采集中")]
    AlreadyRunning,
    #[error("采集启动失败: {0}")]
    Adb(#[from] AdbError),
    #[error("导出失败: {0}")]
    Io(#[from] std::io::Error),
}

struct CaptureInner {
    /// 世代 token（Arc<AtomicU64>）：stop/detach 时自增，
    /// 旧流迟到结束时对比不一致 → 不重复发 Stopped（ADR-v6-006 世代语义）
    generation: Arc<AtomicU64>,
    cancel: CancellationToken,
    _handle: tokio::task::JoinHandle<()>,
}

struct Inner {
    rings: HashMap<String, Arc<RingBuffer>>,
    captures: HashMap<String, CaptureInner>,
    next_generation: u64,
}

/// 采集服务（app 层持有；事件经 sink 送出）。
pub struct CaptureService {
    adb: Arc<AdbClient>,
    sink: mpsc::Sender<AppEvent>,
    ring_capacity: usize,
    inner: Mutex<Inner>,
}

impl CaptureService {
    pub fn new(adb: Arc<AdbClient>, sink: mpsc::Sender<AppEvent>, ring_capacity: usize) -> Arc<Self> {
        Arc::new(Self {
            adb,
            sink,
            ring_capacity: ring_capacity.max(1),
            inner: Mutex::new(Inner {
                rings: HashMap::new(),
                captures: HashMap::new(),
                next_generation: 0,
            }),
        })
    }

    /// 获取（惰性创建）设备共享环形缓冲。
    pub fn ring(self: &Arc<Self>, serial: &str) -> Arc<RingBuffer> {
        let mut inner = self.inner.lock().expect("capture lock poisoned");
        inner
            .rings
            .entry(serial.to_string())
            .or_insert_with(|| Arc::new(RingBuffer::new(self.ring_capacity)))
            .clone()
    }

    /// 开始采集（可选先 `logcat -c`）。
    pub async fn start(self: &Arc<Self>, serial: &str, clear_device: bool) -> Result<(), LogError> {
        {
            let inner = self.inner.lock().expect("capture lock poisoned");
            if inner.captures.contains_key(serial) {
                return Err(LogError::AlreadyRunning);
            }
        }

        if clear_device {
            self.adb.clear_log(serial, CancellationToken::new()).await?;
        }

        let generation = {
            let mut inner = self.inner.lock().expect("capture lock poisoned");
            inner.next_generation += 1;
            Arc::new(AtomicU64::new(inner.next_generation))
        };
        let cancel = CancellationToken::new();

        let ring = self.ring(serial);
        let (batcher, _batch_handle) = Batcher::spawn(
            serial.to_string(),
            self.sink.clone(),
            Duration::from_millis(150),
            1000,
            512 * 1024,
            cancel.clone(),
        );

        let adb = Arc::clone(&self.adb);
        let sink = self.sink.clone();
        let serial_owned = serial.to_string();
        let capture_cancel = cancel.clone();
        let task_generation = Arc::clone(&generation);
        let my_generation = task_generation.load(Ordering::Relaxed);
        let handle = tokio::spawn(async move {
            let (line_tx, mut line_rx) = mpsc::channel::<String>(1024);
            let stream = tokio::spawn({
                let adb = Arc::clone(&adb);
                let cancel = capture_cancel.clone();
                let serial_for_stream = serial_owned.clone();
                async move {
                    adb.stream_lines(
                        &serial_for_stream,
                        &["logcat".into(), "-v".into(), "threadtime".into()],
                        cancel,
                        line_tx,
                    )
                    .await
                }
            });

            // 泵取循环：raw 行 → 解析 → 环形缓冲 → 批量器
            while let Some(raw) = line_rx.recv().await {
                let line = parse_threadtime(&raw);
                ring.push(line.clone());
                if batcher.feed(line).await.is_err() {
                    break;
                }
            }
            let _ = stream.await;

            // 流结束：仅当世代仍为当前时通知 UI 停止（防旧流迟到误报）
            if task_generation.load(Ordering::Relaxed) == my_generation {
                let _ = sink
                    .try_send(AppEvent::CaptureState { serial: serial_owned.clone(), state: CaptureState::Stopped });
            }
        });

        {
            let mut inner = self.inner.lock().expect("capture lock poisoned");
            inner.captures.insert(
                serial.to_string(),
                CaptureInner { generation, cancel, _handle: handle },
            );
        }
        let _ = self.sink.try_send(AppEvent::CaptureState {
            serial: serial.to_string(),
            state: CaptureState::Running,
        });
        Ok(())
    }

    /// 停止采集（保留环形缓冲，可继续过滤重放）。
    pub async fn stop(&self, serial: &str) {
        let taken = {
            let mut inner = self.inner.lock().expect("capture lock poisoned");
            inner.captures.remove(serial)
        };
        if let Some(cap) = taken {
            // 世代自增：旧流的迟到结束检查失效（不重复发 Stopped）
            cap.generation.fetch_add(1, Ordering::Relaxed);
            cap.cancel.cancel();
            let _ = cap._handle.await;
            let _ = self.sink.try_send(AppEvent::CaptureState {
                serial: serial.to_string(),
                state: CaptureState::Stopped,
            });
        }
    }

    /// 是否采集中。
    pub fn is_capturing(&self, serial: &str) -> bool {
        let inner = self.inner.lock().expect("capture lock poisoned");
        inner.captures.contains_key(serial)
    }

    /// 清设备共享缓冲（用户清空）。
    pub fn clear(&self, serial: &str) {
        let inner = self.inner.lock().expect("capture lock poisoned");
        if let Some(ring) = inner.rings.get(serial) {
            ring.clear();
        }
    }

    /// 设备切换/掉线：停采 + 清缓冲（防串设备）。
    pub async fn detach_device(&self, serial: &str) {
        self.stop(serial).await;
        self.clear(serial);
    }
}
