//! 每设备一路投屏：Empty / Starting / Live / Stopping + generation（对标 CaptureService）。

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::sync::{mpsc, Notify};
use tokio_util::sync::CancellationToken;
use yohu_adb::AdbClient;
use yohu_protocol::{AppEvent, MirrorControlMessage, MirrorSessionState, MirrorStart};

use crate::error::MirrorError;
use crate::frame::FramePipe;
use crate::session::{self, ControlCmd, MirrorSessionRequest, SessionOpts};
use crate::tunnel::{self, WarmTunnel};

const START_WAIT: Duration = Duration::from_secs(20);

#[derive(Clone, Copy, PartialEq, Eq)]
enum Phase {
    Starting,
    Live,
    Stopping,
}

struct MirrorSlot {
    generation: u64,
    phase: Phase,
    cancel: CancellationToken,
    handle: Option<tokio::task::JoinHandle<()>>,
    control_tx: Option<mpsc::Sender<ControlCmd>>,
    control: bool,
    frames: Arc<FramePipe>,
}

enum WarmEntry {
    Busy,
    Ready(WarmTunnel),
}

struct Inner {
    slots: HashMap<String, MirrorSlot>,
    last_generation: HashMap<String, u64>,
    next_generation: u64,
    warm: HashMap<String, WarmEntry>,
}

enum StartDecision {
    Adopt(MirrorStart),
    Begin {
        generation: u64,
        cancel: CancellationToken,
        control_rx: mpsc::Receiver<ControlCmd>,
        frames: Arc<FramePipe>,
    },
    Wait,
}

fn remember_and_remove(inner: &mut Inner, serial: &str) -> Option<MirrorSlot> {
    let slot = inner.slots.remove(serial)?;
    slot.frames.close();
    inner
        .last_generation
        .insert(serial.to_string(), slot.generation);
    Some(slot)
}

pub struct MirrorService {
    adb: Arc<AdbClient>,
    sink: mpsc::Sender<AppEvent>,
    server_path: PathBuf,
    inner: Mutex<Inner>,
    changed: Notify,
}

impl MirrorService {
    pub fn new(
        adb: Arc<AdbClient>,
        sink: mpsc::Sender<AppEvent>,
        server_path: PathBuf,
    ) -> Arc<Self> {
        Arc::new(Self {
            adb,
            sink,
            server_path,
            inner: Mutex::new(Inner {
                slots: HashMap::new(),
                last_generation: HashMap::new(),
                next_generation: 0,
                warm: HashMap::new(),
            }),
            changed: Notify::new(),
        })
    }

    fn decide_start(&self, serial: &str) -> StartDecision {
        let mut inner = self.inner.lock().expect("mirror lock poisoned");
        match inner.slots.get(serial) {
            Some(slot) if slot.phase == Phase::Live => StartDecision::Adopt(MirrorStart {
                serial: serial.to_string(),
                generation: slot.generation,
                adopted: true,
            }),
            Some(_) => StartDecision::Wait,
            None => {
                inner.next_generation += 1;
                let generation = inner.next_generation;
                let cancel = CancellationToken::new();
                let (control_tx, control_rx) = mpsc::channel(32);
                let frames = FramePipe::new();
                inner.slots.insert(
                    serial.to_string(),
                    MirrorSlot {
                        generation,
                        phase: Phase::Starting,
                        cancel: cancel.clone(),
                        handle: None,
                        control_tx: Some(control_tx),
                        control: false,
                        frames: Arc::clone(&frames),
                    },
                );
                StartDecision::Begin {
                    generation,
                    cancel,
                    control_rx,
                    frames,
                }
            }
        }
    }

    fn start_must_wait(&self, serial: &str) -> bool {
        let inner = self.inner.lock().expect("mirror lock poisoned");
        matches!(
            inner.slots.get(serial),
            Some(slot) if slot.phase == Phase::Starting || slot.phase == Phase::Stopping
        )
    }

    pub fn frame_pipe(&self, serial: &str) -> Option<Arc<FramePipe>> {
        self.inner
            .lock()
            .expect("mirror lock poisoned")
            .slots
            .get(serial)
            .map(|slot| Arc::clone(&slot.frames))
    }

    pub async fn start(
        self: &Arc<Self>,
        req: MirrorSessionRequest,
    ) -> Result<MirrorStart, MirrorError> {
        let serial = req.serial.clone();
        let (my_generation, cancel, control_rx, frames) = loop {
            match self.decide_start(&serial) {
                StartDecision::Adopt(result) => {
                    tracing::info!(
                        serial = %serial,
                        generation = result.generation,
                        "投屏 adopt（已在 Live）"
                    );
                    return Ok(result);
                }
                StartDecision::Begin {
                    generation,
                    cancel,
                    control_rx,
                    frames,
                } => {
                    self.changed.notify_waiters();
                    break (generation, cancel, control_rx, frames);
                }
                StartDecision::Wait => {
                    let notified = self.changed.notified();
                    if self.start_must_wait(&serial) {
                        tokio::select! {
                            _ = notified => {}
                            _ = tokio::time::sleep(START_WAIT) => {
                                tracing::error!(
                                    serial = %serial,
                                    "投屏 Starting/Stopping 等待超时，强制停止卡住会话"
                                );
                                self.stop(&serial).await;
                            }
                        }
                    }
                }
            }
        };

        session::emit_terminal_state(
            &self.sink,
            &serial,
            my_generation,
            MirrorSessionState::Starting,
            None,
        )
        .await;

        {
            let mut inner = self.inner.lock().expect("mirror lock poisoned");
            if let Some(slot) = inner.slots.get_mut(&serial) {
                if slot.generation == my_generation {
                    slot.control = req.control;
                    if !req.control {
                        slot.control_tx = None;
                    }
                }
            }
        }

        if cancel.is_cancelled() {
            self.abandon_starting(&serial, my_generation).await;
            return Err(MirrorError::Cancelled);
        }

        let warm = self.take_warm(&serial, req.force_forward).await;
        let adb = Arc::clone(&self.adb);
        let sink = self.sink.clone();
        let service = Arc::clone(self);
        let serial_owned = serial.clone();
        let follow_cancel = cancel.clone();
        let requested_hevc = req.video_codec.eq_ignore_ascii_case("h265");
        let opts = SessionOpts {
            req,
            server_path: self.server_path.clone(),
            frames,
            warm,
        };
        let handle = tokio::spawn(async move {
            let mut req = opts.req;
            let server_path = opts.server_path;
            let frames = opts.frames;
            let mut warm = opts.warm;
            let mut control_rx = Some(control_rx);
            let mut tried_h264 = false;
            let result = loop {
                let rx = match control_rx.take() {
                    Some(rx) => rx,
                    None => service.new_control_rx(&serial_owned, my_generation),
                };
                let live_service = Arc::clone(&service);
                let live_serial = serial_owned.clone();
                let result = session::run_session(
                    adb.clone(),
                    sink.clone(),
                    follow_cancel.clone(),
                    my_generation,
                    SessionOpts {
                        req: req.clone(),
                        server_path: server_path.clone(),
                        frames: Arc::clone(&frames),
                        warm: warm.take(),
                    },
                    rx,
                    move |_width, _height, _codec| {
                        live_service.mark_live(&live_serial, my_generation);
                    },
                )
                .await;
                if !follow_cancel.is_cancelled()
                    && service.slot_still_starting(&serial_owned, my_generation)
                    && result
                        .as_ref()
                        .err()
                        .is_some_and(|e| hevc_should_fallback(requested_hevc, tried_h264, e))
                {
                    tracing::warn!(
                        serial = %serial_owned,
                        generation = my_generation,
                        "HEVC 失败，同会话回退 H.264"
                    );
                    req.video_codec = "h264".into();
                    tried_h264 = true;
                    continue;
                }
                break result;
            };
            service
                .release_if_current(&serial_owned, my_generation, result)
                .await;
        });

        let mut handle = Some(handle);
        let published = {
            let mut inner = self.inner.lock().expect("mirror lock poisoned");
            match inner.slots.get_mut(&serial) {
                Some(slot) if slot.generation == my_generation && slot.phase == Phase::Starting => {
                    slot.handle = handle.take();
                    true
                }
                _ => false,
            }
        };
        if !published {
            cancel.cancel();
            if let Some(h) = handle {
                let _ = h.await;
            }
            return Err(MirrorError::Cancelled);
        }
        self.changed.notify_waiters();
        Ok(MirrorStart {
            serial,
            generation: my_generation,
            adopted: false,
        })
    }

    fn mark_live(&self, serial: &str, generation: u64) {
        let mut inner = self.inner.lock().expect("mirror lock poisoned");
        if let Some(slot) = inner.slots.get_mut(serial) {
            if slot.generation == generation && slot.phase == Phase::Starting {
                slot.phase = Phase::Live;
            }
        }
        self.changed.notify_waiters();
    }

    pub async fn stop(&self, serial: &str) {
        let (generation, handle) = loop {
            let wait = {
                let mut inner = self.inner.lock().expect("mirror lock poisoned");
                match inner.slots.get_mut(serial) {
                    None => return,
                    Some(slot) if slot.phase == Phase::Stopping => true,
                    Some(slot) => {
                        slot.phase = Phase::Stopping;
                        slot.cancel.cancel();
                        slot.frames.close();
                        slot.control_tx = None;
                        break (slot.generation, slot.handle.take());
                    }
                }
            };
            if wait {
                let notified = self.changed.notified();
                let still_stopping = {
                    let inner = self.inner.lock().expect("mirror lock poisoned");
                    matches!(
                        inner.slots.get(serial),
                        Some(slot) if slot.phase == Phase::Stopping
                    )
                };
                if still_stopping {
                    notified.await;
                }
            }
        };
        self.changed.notify_waiters();
        if let Some(handle) = handle {
            let _ = handle.await;
        }
        let emit = {
            let mut inner = self.inner.lock().expect("mirror lock poisoned");
            let matches = inner
                .slots
                .get(serial)
                .is_some_and(|slot| slot.generation == generation && slot.phase == Phase::Stopping);
            if matches {
                let _ = remember_and_remove(&mut inner, serial);
                true
            } else {
                false
            }
        };
        if emit {
            session::emit_terminal_state(
                &self.sink,
                serial,
                generation,
                MirrorSessionState::Stopped,
                None,
            )
            .await;
            tracing::info!(serial, generation, "投屏停止");
        }
        self.changed.notify_waiters();
    }

    pub async fn stop_all(&self) {
        let serials: Vec<String> = {
            let inner = self.inner.lock().expect("mirror lock poisoned");
            inner.slots.keys().cloned().collect()
        };
        for serial in serials {
            self.stop(&serial).await;
        }
    }

    pub async fn inject(
        &self,
        serial: &str,
        message: MirrorControlMessage,
    ) -> Result<(), MirrorError> {
        let tx = {
            let inner = self.inner.lock().expect("mirror lock poisoned");
            match inner.slots.get(serial) {
                Some(slot) if slot.phase == Phase::Live => slot.control_tx.clone(),
                Some(_) | None => return Err(MirrorError::NotLive),
            }
        };
        let Some(tx) = tx else {
            return Err(MirrorError::NoControl);
        };
        tx.send(ControlCmd::Send(session::encode_control(&message)))
            .await
            .map_err(|_| MirrorError::NoControl)
    }

    pub fn close_control(&self, serial: &str) -> Result<(), MirrorError> {
        let tx = {
            let mut inner = self.inner.lock().expect("mirror lock poisoned");
            match inner.slots.get_mut(serial) {
                Some(slot) if slot.phase == Phase::Live => {
                    slot.control = false;
                    slot.control_tx.take()
                }
                Some(_) | None => return Err(MirrorError::NotLive),
            }
        };
        if let Some(tx) = tx {
            let _ = tx.try_send(ControlCmd::Close);
        }
        Ok(())
    }

    async fn abandon_starting(&self, serial: &str, generation: u64) {
        let dropped = {
            let mut inner = self.inner.lock().expect("mirror lock poisoned");
            let matches = inner
                .slots
                .get(serial)
                .is_some_and(|slot| slot.generation == generation && slot.phase == Phase::Starting);
            if matches {
                let _ = remember_and_remove(&mut inner, serial);
                true
            } else {
                false
            }
        };
        if dropped {
            session::emit_terminal_state(
                &self.sink,
                serial,
                generation,
                MirrorSessionState::Stopped,
                None,
            )
            .await;
            self.changed.notify_waiters();
        }
    }

    async fn release_if_current(
        &self,
        serial: &str,
        generation: u64,
        result: Result<(), MirrorError>,
    ) {
        let taken = {
            let mut inner = self.inner.lock().expect("mirror lock poisoned");
            let matches = inner.slots.get(serial).is_some_and(|slot| {
                slot.generation == generation
                    && (slot.phase == Phase::Live
                        || slot.phase == Phase::Starting
                        || slot.phase == Phase::Stopping)
            });
            if matches {
                remember_and_remove(&mut inner, serial)
            } else {
                None
            }
        };
        if taken.is_some() {
            let (state, error) = match result {
                Ok(()) | Err(MirrorError::Cancelled) => (MirrorSessionState::Stopped, None),
                Err(e) => {
                    tracing::error!(serial, generation, error = %e, "投屏流失败");
                    (MirrorSessionState::Failed, Some(e.to_string()))
                }
            };
            session::emit_terminal_state(&self.sink, serial, generation, state, error).await;
            tracing::info!(serial, generation, "投屏流结束");
            self.changed.notify_waiters();
        }
    }

    fn slot_still_starting(&self, serial: &str, generation: u64) -> bool {
        let inner = self.inner.lock().expect("mirror lock poisoned");
        inner.slots.get(serial).is_some_and(|slot| {
            slot.generation == generation && slot.phase == Phase::Starting
        })
    }

    fn new_control_rx(&self, serial: &str, generation: u64) -> mpsc::Receiver<ControlCmd> {
        let (tx, rx) = mpsc::channel(32);
        let mut inner = self.inner.lock().expect("mirror lock poisoned");
        if let Some(slot) = inner.slots.get_mut(serial) {
            if slot.generation == generation && slot.control {
                slot.control_tx = Some(tx);
            }
        }
        rx
    }

    /// 设备扫描成功后对在线设备后台预热（跳过 push + 预挂隧道）。
    pub async fn warmup(self: &Arc<Self>, serial: &str, force_forward: bool) {
        {
            let mut inner = self.inner.lock().expect("mirror lock poisoned");
            if inner.slots.contains_key(serial) {
                return;
            }
            match inner.warm.get(serial) {
                Some(WarmEntry::Busy | WarmEntry::Ready(_)) => return,
                None => {
                    inner.warm.insert(serial.to_string(), WarmEntry::Busy);
                }
            }
        }
        let result = tunnel::warmup(
            &self.adb,
            serial,
            &self.server_path,
            force_forward,
            CancellationToken::new(),
        )
        .await;
        let stale = {
            let mut inner = self.inner.lock().expect("mirror lock poisoned");
            match result {
                Ok(tunnel) => {
                    if inner.slots.contains_key(serial) {
                        Some(tunnel)
                    } else {
                        tracing::info!(serial, "投屏预热完成");
                        inner
                            .warm
                            .insert(serial.to_string(), WarmEntry::Ready(tunnel));
                        None
                    }
                }
                Err(e) => {
                    tracing::warn!(serial, error = %e, "投屏预热失败");
                    inner.warm.remove(serial);
                    None
                }
            }
        };
        if let Some(tunnel) = stale {
            tunnel
                .drop_async(&self.adb, serial, CancellationToken::new())
                .await;
        }
    }

    pub async fn drop_warm(&self, serial: &str) {
        let taken = {
            let mut inner = self.inner.lock().expect("mirror lock poisoned");
            inner.warm.remove(serial)
        };
        if let Some(WarmEntry::Ready(tunnel)) = taken {
            tunnel
                .drop_async(&self.adb, serial, CancellationToken::new())
                .await;
        }
    }

    async fn take_warm(&self, serial: &str, force_forward: bool) -> Option<WarmTunnel> {
        for _ in 0..25 {
            enum Step {
                Ready(WarmTunnel),
                Mismatch(WarmTunnel),
                Wait,
                Miss,
            }
            let step = {
                let mut inner = self.inner.lock().expect("mirror lock poisoned");
                match inner.warm.remove(serial) {
                    Some(WarmEntry::Ready(tunnel)) => {
                        if tunnel.used_forward == force_forward {
                            Step::Ready(tunnel)
                        } else {
                            Step::Mismatch(tunnel)
                        }
                    }
                    Some(WarmEntry::Busy) => {
                        inner
                            .warm
                            .insert(serial.to_string(), WarmEntry::Busy);
                        Step::Wait
                    }
                    None => Step::Miss,
                }
            };
            match step {
                Step::Ready(t) => return Some(t),
                Step::Mismatch(t) => {
                    t.drop_async(&self.adb, serial, CancellationToken::new())
                        .await;
                    return None;
                }
                Step::Miss => return None,
                Step::Wait => tokio::time::sleep(Duration::from_millis(80)).await,
            }
        }
        None
    }
}

fn hevc_should_fallback(requested_hevc: bool, tried_h264: bool, err: &MirrorError) -> bool {
    requested_hevc
        && !tried_h264
        && matches!(err, MirrorError::ServerFailed(_) | MirrorError::Protocol(_))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hevc_falls_back_once_on_server_error() {
        assert!(hevc_should_fallback(
            true,
            false,
            &MirrorError::ServerFailed("codec".into())
        ));
        assert!(hevc_should_fallback(
            true,
            false,
            &MirrorError::Protocol("config".into())
        ));
        assert!(!hevc_should_fallback(
            true,
            true,
            &MirrorError::ServerFailed("codec".into())
        ));
        assert!(!hevc_should_fallback(
            false,
            false,
            &MirrorError::ServerFailed("codec".into())
        ));
        assert!(!hevc_should_fallback(true, false, &MirrorError::Cancelled));
    }
}
