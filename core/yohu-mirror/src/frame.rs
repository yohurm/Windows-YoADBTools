//! 会话专用有界帧队列：sticky 最后一份 config；IDR 优先于 delta。零 Tauri。

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use tokio::sync::Notify;

pub const CODEC_H264: u8 = 0;
pub const CODEC_H265: u8 = 1;
const QUEUE_CAP: usize = 8;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EncodedFrame {
    pub generation: u64,
    pub width: u32,
    pub height: u32,
    pub config: bool,
    pub keyframe: bool,
    pub pts: u64,
    pub codec: u8,
    pub payload: Vec<u8>,
    pub dropped: u32,
}

impl EncodedFrame {
    fn is_delta(&self) -> bool {
        !self.config && !self.keyframe
    }
}

/// 会话帧泵。config 不进容量队列；满时先丢 delta，不为 delta 丢掉最后的 IDR。
pub struct FramePipe {
    last_config: Mutex<Option<EncodedFrame>>,
    pending_config: AtomicBool,
    queue: Mutex<VecDeque<EncodedFrame>>,
    notify: Notify,
    closed: AtomicBool,
    dropped: AtomicU32,
}

impl FramePipe {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            last_config: Mutex::new(None),
            pending_config: AtomicBool::new(false),
            queue: Mutex::new(VecDeque::with_capacity(QUEUE_CAP)),
            notify: Notify::new(),
            closed: AtomicBool::new(false),
            dropped: AtomicU32::new(0),
        })
    }

    pub fn close(&self) {
        self.closed.store(true, Ordering::SeqCst);
        self.notify.notify_waiters();
    }

    pub fn dropped(&self) -> u32 {
        self.dropped.load(Ordering::SeqCst)
    }

    pub fn push(&self, mut frame: EncodedFrame) {
        if self.closed.load(Ordering::SeqCst) {
            return;
        }
        frame.dropped = self.dropped.load(Ordering::SeqCst);
        if frame.config {
            *self.last_config.lock().expect("frame pipe lock poisoned") = Some(frame);
            self.pending_config.store(true, Ordering::SeqCst);
            self.notify.notify_one();
            return;
        }
        let mut queue = self.queue.lock().expect("frame pipe lock poisoned");
        if queue.len() >= QUEUE_CAP && !evict_for(&mut queue, &frame, &self.dropped) {
            return;
        }
        frame.dropped = self.dropped.load(Ordering::SeqCst);
        queue.push_back(frame);
        drop(queue);
        self.notify.notify_one();
    }

    fn pop(&self) -> Option<EncodedFrame> {
        if self.pending_config.swap(false, Ordering::SeqCst) {
            if let Some(config) = self
                .last_config
                .lock()
                .expect("frame pipe lock poisoned")
                .clone()
            {
                return Some(config);
            }
        }
        self.queue
            .lock()
            .expect("frame pipe lock poisoned")
            .pop_front()
    }

    pub async fn recv(&self) -> Option<EncodedFrame> {
        loop {
            if let Some(frame) = self.pop() {
                return Some(frame);
            }
            if self.closed.load(Ordering::SeqCst) {
                return self.pop();
            }
            self.notify.notified().await;
        }
    }

    /// 呈现线程直取。禁止再泵进无界通道，否则本队列的 8 帧背压失效。
    pub fn try_recv(&self) -> Option<EncodedFrame> {
        self.pop()
    }
}

fn evict_for(
    queue: &mut VecDeque<EncodedFrame>,
    incoming: &EncodedFrame,
    dropped: &AtomicU32,
) -> bool {
    if incoming.keyframe {
        let before = queue.len();
        queue.retain(|f| !f.is_delta());
        let n = (before - queue.len()) as u32;
        if n > 0 {
            dropped.fetch_add(n, Ordering::SeqCst);
        }
        if queue.len() < QUEUE_CAP {
            return true;
        }
        if let Some(i) = queue.iter().position(|f| f.keyframe) {
            queue.remove(i);
            dropped.fetch_add(1, Ordering::SeqCst);
            return true;
        }
        return false;
    }
    if let Some(i) = queue.iter().position(EncodedFrame::is_delta) {
        queue.remove(i);
        dropped.fetch_add(1, Ordering::SeqCst);
        return true;
    }
    dropped.fetch_add(1, Ordering::SeqCst);
    false
}

pub fn codec_id(name: &str) -> u8 {
    if name.eq_ignore_ascii_case("h265") || name.eq_ignore_ascii_case("hevc") {
        CODEC_H265
    } else {
        CODEC_H264
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(config: bool, keyframe: bool, pts: u64) -> EncodedFrame {
        EncodedFrame {
            generation: 1,
            width: 8,
            height: 8,
            config,
            keyframe,
            pts,
            codec: CODEC_H264,
            payload: vec![pts as u8],
            dropped: 0,
        }
    }

    #[test]
    fn drop_delta_keep_config_and_idr() {
        let pipe = FramePipe::new();
        pipe.push(frame(true, false, 0));
        for i in 1..=8 {
            pipe.push(frame(false, false, i));
        }
        pipe.push(frame(false, true, 99));
        let first = pipe.pop().expect("config");
        assert!(first.config);
        let second = pipe.pop().expect("idr");
        assert!(second.keyframe);
        assert_eq!(second.pts, 99);
        assert!(pipe.dropped() >= 1);
        assert!(pipe.pop().is_none());
    }

    #[test]
    fn idr_drops_oldest_when_queue_is_idrs() {
        let pipe = FramePipe::new();
        pipe.push(frame(true, false, 0));
        for i in 1..=8 {
            pipe.push(frame(false, true, i));
        }
        pipe.push(frame(false, true, 100));
        let first = pipe.pop().expect("config");
        assert_eq!(first.pts, 0);
        let pts: Vec<u64> = (0..8).filter_map(|_| pipe.pop().map(|f| f.pts)).collect();
        assert!(pts.contains(&100), "newest idr kept: {pts:?}");
        assert!(!pts.contains(&1), "oldest idr dropped: {pts:?}");
    }

    #[test]
    fn delta_does_not_evict_last_idr() {
        let pipe = FramePipe::new();
        pipe.push(frame(true, false, 0));
        pipe.push(frame(false, true, 1));
        for i in 2..=9 {
            pipe.push(frame(false, false, i));
        }
        pipe.push(frame(false, false, 10));
        let _ = pipe.pop();
        let second = pipe.pop().expect("idr");
        assert!(second.keyframe);
        assert_eq!(second.pts, 1);
        assert!(pipe.dropped() >= 1);
    }

    #[test]
    fn new_config_replaces_sticky_slot() {
        let pipe = FramePipe::new();
        pipe.push(frame(true, false, 0));
        pipe.push(frame(true, false, 7));
        let first = pipe.pop().expect("latest config");
        assert_eq!(first.pts, 7);
        assert!(pipe.pop().is_none());
    }

    #[test]
    fn try_recv_drains_without_wait() {
        let pipe = FramePipe::new();
        pipe.push(frame(true, false, 0));
        pipe.push(frame(false, true, 1));
        assert!(pipe.try_recv().expect("config").config);
        assert!(pipe.try_recv().expect("idr").keyframe);
        assert!(pipe.try_recv().is_none());
    }

    #[test]
    fn codec_id_maps_hevc() {
        assert_eq!(codec_id("h265"), CODEC_H265);
        assert_eq!(codec_id("HEVC"), CODEC_H265);
        assert_eq!(codec_id("h264"), CODEC_H264);
    }
}
