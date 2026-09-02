//! 会话专用有界帧队列：先丢 delta，不丢 config。零 Tauri。

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use tokio::sync::Notify;

pub const HEADER_SIZE: usize = 32;
pub const HEADER_VERSION: u8 = 1;
pub const CODEC_H264: u8 = 0;
pub const FLAG_CONFIG: u8 = 0b0000_0001;
pub const FLAG_KEYFRAME: u8 = 0b0000_0010;
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

/// 会话帧泵。满时先丢非关键帧；config 不丢；IDR 仅在队列已无 delta 时丢最旧 IDR。
pub struct FramePipe {
    queue: Mutex<VecDeque<EncodedFrame>>,
    notify: Notify,
    closed: AtomicBool,
    dropped: AtomicU32,
}

impl FramePipe {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
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
}

fn evict_for(
    queue: &mut VecDeque<EncodedFrame>,
    incoming: &EncodedFrame,
    dropped: &AtomicU32,
) -> bool {
    if incoming.config {
        if let Some(i) = queue.iter().position(EncodedFrame::is_delta) {
            queue.remove(i);
            dropped.fetch_add(1, Ordering::SeqCst);
            return true;
        }
        if let Some(i) = queue.iter().position(|f| !f.config && f.keyframe) {
            queue.remove(i);
            dropped.fetch_add(1, Ordering::SeqCst);
            return true;
        }
        return false;
    }
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
        if let Some(i) = queue.iter().position(|f| !f.config && f.keyframe) {
            queue.remove(i);
            dropped.fetch_add(1, Ordering::SeqCst);
            return true;
        }
        return false;
    }
    dropped.fetch_add(1, Ordering::SeqCst);
    false
}

pub fn encode_frame(frame: &EncodedFrame) -> Vec<u8> {
    let mut flags = 0u8;
    if frame.config {
        flags |= FLAG_CONFIG;
    }
    if frame.keyframe {
        flags |= FLAG_KEYFRAME;
    }
    let mut out = Vec::with_capacity(HEADER_SIZE + frame.payload.len());
    out.push(HEADER_VERSION);
    out.push(flags);
    out.push(frame.codec);
    out.push(0);
    out.extend_from_slice(&frame.width.to_le_bytes());
    out.extend_from_slice(&frame.height.to_le_bytes());
    out.extend_from_slice(&frame.dropped.to_le_bytes());
    out.extend_from_slice(&frame.generation.to_le_bytes());
    out.extend_from_slice(&frame.pts.to_le_bytes());
    out.extend_from_slice(&frame.payload);
    out
}

pub fn decode_frame(bytes: &[u8]) -> Option<EncodedFrame> {
    if bytes.len() < HEADER_SIZE || bytes[0] != HEADER_VERSION {
        return None;
    }
    let flags = bytes[1];
    Some(EncodedFrame {
        codec: bytes[2],
        width: u32::from_le_bytes(bytes[4..8].try_into().ok()?),
        height: u32::from_le_bytes(bytes[8..12].try_into().ok()?),
        dropped: u32::from_le_bytes(bytes[12..16].try_into().ok()?),
        generation: u64::from_le_bytes(bytes[16..24].try_into().ok()?),
        pts: u64::from_le_bytes(bytes[24..32].try_into().ok()?),
        config: flags & FLAG_CONFIG != 0,
        keyframe: flags & FLAG_KEYFRAME != 0,
        payload: bytes[HEADER_SIZE..].to_vec(),
    })
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
    fn header_roundtrip() {
        let src = EncodedFrame {
            generation: 9,
            width: 1080,
            height: 1920,
            config: true,
            keyframe: true,
            pts: 12_345,
            codec: CODEC_H264,
            payload: vec![1, 2, 3, 4],
            dropped: 7,
        };
        let decoded = decode_frame(&encode_frame(&src)).expect("header");
        assert_eq!(decoded, src);
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
        assert!(pipe.dropped() >= 1);
        assert!(pipe.pop().is_none() || pipe.pop().is_none());
    }

    #[test]
    fn idr_drops_oldest_when_queue_is_idrs() {
        let pipe = FramePipe::new();
        pipe.push(frame(true, false, 0));
        for i in 1..=8 {
            pipe.push(frame(false, true, i));
        }
        pipe.push(frame(false, true, 100));
        let pts: Vec<u64> = (0..9).filter_map(|_| pipe.pop().map(|f| f.pts)).collect();
        assert!(pts.contains(&0), "config kept: {pts:?}");
        assert!(pts.contains(&100), "newest idr kept: {pts:?}");
        assert!(!pts.contains(&1), "oldest idr dropped: {pts:?}");
    }
}
