//! 批量器（ADR-v6-007 核心）：logcat 行聚合后成批推送，**禁逐行**。
//!
//! 聚合策略：定时 100–200ms 或满 `max_lines` 行 / `max_bytes` 字节，先到先发。
//! 背压策略：下游事件队列有界（try_send）——溢出时**丢推送不丢环**，
//! 计数经 `LogOverflow` 事件告知 UI，由 `log.replay(fromSeq)` 补齐。

use std::time::Duration;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use yovo_protocol::{AppEvent, LogBatch, LogBatchPayload, LogLine};

/// 批量器句柄（feed 行）。
pub struct Batcher {
    line_tx: mpsc::Sender<LogLine>,
}

impl Batcher {
    /// 启动聚合循环；返回句柄与 JoinHandle。
    pub fn spawn(
        serial: String,
        sink: mpsc::Sender<AppEvent>,
        flush_interval: Duration,
        max_lines: usize,
        max_bytes: usize,
        cancel: CancellationToken,
    ) -> (Self, tokio::task::JoinHandle<()>) {
        let (line_tx, line_rx) = mpsc::channel::<LogLine>(4096);
        let handle = tokio::spawn(aggregate_loop(
            serial,
            line_rx,
            sink,
            flush_interval,
            max_lines,
            max_bytes,
            cancel,
        ));
        (Self { line_tx }, handle)
    }

    /// 送入一行（异步背压：聚合环消费快于生产，正常不阻塞）。
    pub async fn feed(&self, line: LogLine) -> Result<(), mpsc::error::SendError<LogLine>> {
        self.line_tx.send(line).await
    }
}

async fn aggregate_loop(
    serial: String,
    mut line_rx: mpsc::Receiver<LogLine>,
    sink: mpsc::Sender<AppEvent>,
    flush_interval: Duration,
    max_lines: usize,
    max_bytes: usize,
    cancel: CancellationToken,
) {
    let mut interval = tokio::time::interval(flush_interval);
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    let mut pending: Vec<LogLine> = Vec::with_capacity(1024);
    let mut pending_bytes: usize = 0;
    let mut dropped_batches: u64 = 0;

    loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => {
                // 取消：不再推送（UI 已随停止处理，缓冲可重放）
                break;
            }
            line = line_rx.recv() => {
                let Some(line) = line else {
                    // 生产端结束：最后一搏冲刷剩余行，避免尾部批次丢失
                    if !pending.is_empty() {
                        flush(&mut pending, &mut pending_bytes, &serial, &sink, &mut dropped_batches);
                    }
                    break;
                };
                pending_bytes += line.ts.len() + line.tag.len() + line.msg.len() + 32;
                pending.push(line);
                if pending.len() >= max_lines || pending_bytes >= max_bytes {
                    flush(&mut pending, &mut pending_bytes, &serial, &sink, &mut dropped_batches);
                }
            }
            _ = interval.tick() => {
                if !pending.is_empty() {
                    flush(&mut pending, &mut pending_bytes, &serial, &sink, &mut dropped_batches);
                } else if dropped_batches > 0 {
                    emit_overflow(&sink, &serial, &mut dropped_batches);
                }
            }
        }
    }
}

fn flush(
    pending: &mut Vec<LogLine>,
    pending_bytes: &mut usize,
    serial: &str,
    sink: &mpsc::Sender<AppEvent>,
    dropped_batches: &mut u64,
) {
    let lines = std::mem::take(pending);
    *pending_bytes = 0;
    if lines.is_empty() {
        return;
    }
    let from_seq = lines[0].seq;
    let batch = LogBatch { serial: serial.to_string(), from_seq, lines, truncated: false };
    match sink.try_send(AppEvent::LogBatch(LogBatchPayload { batch })) {
        Ok(()) => {
            if *dropped_batches > 0 {
                emit_overflow(sink, serial, dropped_batches);
            }
        }
        Err(mpsc::error::TrySendError::Full(_)) => {
            // 丢推送不丢环：RingBuffer 仍持有全量，UI 经 replay 补齐
            *dropped_batches += 1;
        }
        Err(mpsc::error::TrySendError::Closed(_)) => {}
    }
}

fn emit_overflow(sink: &mpsc::Sender<AppEvent>, serial: &str, dropped: &mut u64) {
    if *dropped == 0 {
        return;
    }
    let event = AppEvent::LogOverflow { serial: serial.to_string(), dropped_batches: *dropped };
    if sink.try_send(event).is_ok() {
        *dropped = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use yovo_protocol::LogBatchPayload;

    fn line(i: u64) -> LogLine {
        LogLine {
            seq: i,
            ts: "01-01 00:00:00.000".into(),
            pid: 1,
            tid: 1,
            uid: None,
            level: 'I',
            tag: "T".into(),
            msg: format!("line {i}"),
        }
    }

    #[tokio::test]
    async fn aggregates_by_timer() {
        let (sink, mut sink_rx) = mpsc::channel::<AppEvent>(16);
        let (batcher, handle) = Batcher::spawn(
            "s1".into(),
            sink,
            Duration::from_millis(10),
            1000,
            512 * 1024,
            CancellationToken::new(),
        );
        batcher.feed(line(0)).await.unwrap();
        batcher.feed(line(1)).await.unwrap();

        let event = tokio::time::timeout(Duration::from_secs(2), sink_rx.recv())
            .await
            .expect("聚合超时")
            .expect("channel closed");
        match event {
            AppEvent::LogBatch(LogBatchPayload { batch }) => {
                assert_eq!(batch.from_seq, 0);
                assert_eq!(batch.lines.len(), 2);
            }
            other => panic!("unexpected event: {other:?}"),
        }
        drop(batcher);
        let _ = handle.await;
    }

    #[tokio::test]
    async fn flushes_early_on_line_threshold() {
        let (sink, mut sink_rx) = mpsc::channel::<AppEvent>(16);
        let (batcher, handle) = Batcher::spawn(
            "s1".into(),
            sink,
            Duration::from_secs(60),
            3, // 阈值 3 行
            512 * 1024,
            CancellationToken::new(),
        );
        for i in 0..3 {
            batcher.feed(line(i)).await.unwrap();
        }
        let event = tokio::time::timeout(Duration::from_secs(2), sink_rx.recv())
            .await
            .expect("行阈值未触发")
            .expect("channel closed");
        match event {
            AppEvent::LogBatch(LogBatchPayload { batch }) => assert_eq!(batch.lines.len(), 3),
            other => panic!("unexpected event: {other:?}"),
        }
        drop(batcher);
        let _ = handle.await;
    }

    #[tokio::test]
    async fn overflow_drops_push_but_reports() {
        // 下游容量 1：批量器将持续溢出，随后应收到 LogOverflow 计数
        let (sink, mut sink_rx) = mpsc::channel::<AppEvent>(1);
        let (batcher, handle) = Batcher::spawn(
            "s1".into(),
            sink,
            Duration::from_millis(10),
            2,
            512 * 1024,
            CancellationToken::new(),
        );
        // 喂 6 行 → 3 批；下游只取 1 批 → 2 批溢出
        for i in 0..6 {
            batcher.feed(line(i)).await.unwrap();
        }
        let mut saw_batch = false;
        let mut saw_overflow = false;
        let deadline = tokio::time::Instant::now() + Duration::from_secs(2);
        while tokio::time::Instant::now() < deadline && !(saw_batch && saw_overflow) {
            match sink_rx.recv().await {
                Some(AppEvent::LogBatch(_)) => saw_batch = true,
                Some(AppEvent::LogOverflow { dropped_batches, .. }) => {
                    assert!(dropped_batches > 0);
                    saw_overflow = true;
                }
                _ => {}
            }
        }
        assert!(saw_batch, "应有至少一批成功推送");
        assert!(saw_overflow, "溢出必须被计数上报");
        drop(batcher);
        let _ = handle.await;
    }

    /// 性能回归（架构文档 §12 自动化子集）：50k 行 → 50 批（每批 1000），
    /// 零丢行且聚合耗时满足 ADR-v6-007 批量预算（16ms/批；debug 构建留 2.5x 余量）。
    #[tokio::test]
    async fn perf_50k_lines_within_batch_budget() {
        const BATCH_LINES: usize = 1000;
        const TOTAL: u64 = 50_000;
        let (sink, mut sink_rx) = mpsc::channel::<AppEvent>(64);
        let (batcher, handle) = Batcher::spawn(
            "s1".into(),
            sink,
            Duration::from_millis(150),
            BATCH_LINES,
            512 * 1024,
            CancellationToken::new(),
        );
        let started = std::time::Instant::now();
        for i in 0..TOTAL {
            batcher.feed(line(i)).await.unwrap();
        }
        drop(batcher);
        let _ = handle.await;
        let elapsed = started.elapsed();

        let mut batches = 0u32;
        let mut lines = 0usize;
        while let Ok(event) = sink_rx.try_recv() {
            if let AppEvent::LogBatch(LogBatchPayload { batch }) = event {
                batches += 1;
                lines += batch.lines.len();
            }
        }
        assert_eq!(batches, 50, "50k 行应恰好 50 批（每批 1000 行）");
        assert_eq!(lines, TOTAL as usize, "零丢行");
        assert!(
            elapsed.as_millis() < 2000,
            "50 批聚合耗时超预算（16ms/批 → 800ms，余量 2.5x）: {elapsed:?}"
        );
    }
}
