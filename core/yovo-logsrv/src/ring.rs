//! 设备级共享环形缓冲（ADR-v6-006）。
//!
//! - `seq` 单调递增（设备内），是回补/溢出检测的锚点
//! - 设备切换/掉线 → `clear()`（防串设备）
//! - 导出/重放永远基于本缓冲快照（与推送通道状态无关 → 数据不丢）

use std::collections::VecDeque;
use std::sync::Mutex;

use yovo_protocol::{LogFilter, LogLine};

struct State {
    buf: VecDeque<LogLine>,
    next_seq: u64,
}

/// 设备级共享环形缓冲。
pub struct RingBuffer {
    inner: Mutex<State>,
    capacity: usize,
}

impl RingBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            inner: Mutex::new(State { buf: VecDeque::with_capacity(capacity.min(4096)), next_seq: 0 }),
            capacity: capacity.max(1),
        }
    }

    /// 写入一行（分配 seq）；返回该行 seq。
    pub fn push(&self, mut line: LogLine) -> u64 {
        let mut state = self.inner.lock().expect("ring lock poisoned");
        let seq = state.next_seq;
        line.seq = seq;
        state.buf.push_back(line);
        while state.buf.len() > self.capacity {
            state.buf.pop_front();
        }
        state.next_seq += 1;
        seq
    }

    /// 快照：`seq >= from_seq` 的前 `limit` 行（回补用）。
    pub fn snapshot(&self, from_seq: u64, limit: usize) -> Vec<LogLine> {
        let state = self.inner.lock().expect("ring lock poisoned");
        state
            .buf
            .iter()
            .filter(|l| l.seq >= from_seq)
            .take(limit)
            .cloned()
            .collect()
    }

    /// 过滤快照（导出用；过滤语义与 UI 会话一致）。
    pub fn snapshot_filtered(&self, filter: &LogFilter, limit: usize) -> Vec<LogLine> {
        let state = self.inner.lock().expect("ring lock poisoned");
        state
            .buf
            .iter()
            .filter(|l| filter.matches(l))
            .take(limit)
            .cloned()
            .collect()
    }

    /// 清空缓冲（用户清空 / 设备切换 / 掉线）。
    pub fn clear(&self) {
        let mut state = self.inner.lock().expect("ring lock poisoned");
        state.buf.clear();
        // seq 不回退：防止旧批次/旧回补被误判为新数据
    }

    pub fn len(&self) -> usize {
        self.inner.lock().expect("ring lock poisoned").buf.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// 当前已分配的最大 seq（UI 判断滞后量的参考）。
    pub fn last_seq(&self) -> u64 {
        let state = self.inner.lock().expect("ring lock poisoned");
        state.next_seq.saturating_sub(1)
    }

    pub fn capacity(&self) -> usize {
        self.capacity
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(seq_hint: u64) -> LogLine {
        LogLine {
            seq: seq_hint,
            ts: "01-01 00:00:00.000".into(),
            pid: 1,
            tid: 1,
            level: 'I',
            tag: "T".into(),
            msg: format!("m{seq_hint}"),
        }
    }

    #[test]
    fn assigns_monotonic_seq() {
        let ring = RingBuffer::new(10);
        assert_eq!(ring.push(line(999)), 0);
        assert_eq!(ring.push(line(999)), 1);
        assert_eq!(ring.last_seq(), 1);
    }

    #[test]
    fn evicts_oldest_beyond_capacity() {
        let ring = RingBuffer::new(3);
        for _ in 0..5 {
            ring.push(line(0));
        }
        assert_eq!(ring.len(), 3);
        let snap = ring.snapshot(0, 10);
        assert_eq!(snap[0].seq, 2);
        assert_eq!(snap[2].seq, 4);
    }

    #[test]
    fn snapshot_from_seq_and_filter() {
        let ring = RingBuffer::new(10);
        for _ in 0..5 {
            ring.push(line(0));
        }
        let from_two = ring.snapshot(2, 10);
        assert_eq!(from_two.len(), 3);

        let filter = LogFilter { exact_pid: Some(1), ..Default::default() };
        assert_eq!(ring.snapshot_filtered(&filter, 100).len(), 5);
    }

    #[test]
    fn clear_keeps_seq_monotonic() {
        let ring = RingBuffer::new(10);
        ring.push(line(0));
        ring.clear();
        assert!(ring.is_empty());
        // 清空后 seq 继续递增，不回退
        assert_eq!(ring.push(line(0)), 1);
    }
}
