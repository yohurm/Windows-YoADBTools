//! 进程索引服务：采集中周期 `ps` 刷新包名↔PID 映射。
//!
//! 变更才发事件；失败降级「仅 PID 模式」（degraded 标志）。

use std::sync::Arc;
use std::time::Duration;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use yovo_adb::AdbClient;
use yovo_protocol::{AppEvent, ProcessEntry, ProcessIndexSnapshot};

/// 启动周期刷新循环。
pub async fn run(
    serial: String,
    adb: Arc<AdbClient>,
    sink: mpsc::Sender<AppEvent>,
    interval: Duration,
    cancel: CancellationToken,
) {
    let mut ticker = tokio::time::interval(interval);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut last: Option<Vec<ProcessEntry>> = None;
    let mut degraded_reported = false;

    loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => break,
            _ = ticker.tick() => {}
        }
        match adb.ps(&serial, cancel.clone()).await {
            Ok(entries) => {
                if last.as_ref() != Some(&entries) {
                    let _ = sink.try_send(AppEvent::ProcessIndex(ProcessIndexSnapshot {
                        serial: serial.clone(),
                        entries: entries.clone(),
                        degraded: false,
                    }));
                    last = Some(entries);
                }
                degraded_reported = false;
            }
            Err(_) if !degraded_reported => {
                degraded_reported = true;
                let _ = sink.try_send(AppEvent::ProcessIndex(ProcessIndexSnapshot {
                    serial: serial.clone(),
                    entries: Vec::new(),
                    degraded: true,
                }));
            }
            Err(_) => {}
        }
    }
}
