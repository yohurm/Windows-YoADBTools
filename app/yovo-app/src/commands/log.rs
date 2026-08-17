//! 日志模块命令：采集控制/回补/导出。

use std::time::Duration;

use tauri::State;
use tokio_util::sync::CancellationToken;

use crate::commands::ipc;
use crate::state::AppState;
use yovo_protocol::{ExportRequest, ExportResult, IpcError, LogBatch, ReplayRequest};

/// `log.capture.start`：开始采集（幂等；可选先 `logcat -c`）+ 进程索引启动。
#[tauri::command]
pub async fn log_capture_start(
    state: State<'_, AppState>,
    serial: String,
) -> Result<(), IpcError> {
    let clear = state.settings.snapshot().clear_device_on_start;
    state.capture.start(&serial, clear).await.map_err(ipc)?;

    // 进程索引：采集中周期 ps 刷新
    let index_cancel = CancellationToken::new();
    state.index_cancels.lock().expect("index lock poisoned").insert(serial.clone(), index_cancel.clone());
    let client = state.client.clone();
    let sink = state.event_tx.clone();
    let serial_for_task = serial.clone();
    tokio::spawn(yovo_logsrv::index::run(
        serial_for_task,
        client,
        sink,
        Duration::from_millis(2500),
        index_cancel,
    ));

    let task_id = state.tasks.register(format!("logcat 采集: {serial}"), format!("设备 {serial}"));
    state.capture_tasks.lock().expect("capture lock poisoned").insert(serial, task_id);
    Ok(())
}

/// `log.capture.stop`：停采（保留缓冲，可继续过滤重放）。
#[tauri::command]
pub async fn log_capture_stop(state: State<'_, AppState>, serial: String) -> Result<(), IpcError> {
    if let Some(cancel) = state.index_cancels.lock().expect("index lock poisoned").remove(&serial) {
        cancel.cancel();
    }
    state.capture.stop(&serial).await;
    if let Some(task_id) = state.capture_tasks.lock().expect("capture lock poisoned").remove(&serial) {
        state.tasks.finish(task_id);
    }
    Ok(())
}

/// `log.clear`：清设备共享缓冲（会话可见区由 UI 清）。
#[tauri::command]
pub fn log_clear(state: State<'_, AppState>, serial: String) -> Result<(), IpcError> {
    state.capture.clear(&serial);
    Ok(())
}

/// `log.clearDevice`：`logcat -c` 并清共享缓冲。
#[tauri::command]
pub async fn log_clear_device(state: State<'_, AppState>, serial: String) -> Result<(), IpcError> {
    state
        .client
        .clear_log(&serial, CancellationToken::new())
        .await
        .map_err(ipc)?;
    state.capture.clear(&serial);
    Ok(())
}

/// `log.replay`：回补/会话重建（溢出补齐与过滤重放共用）。
#[tauri::command]
pub fn log_replay(state: State<'_, AppState>, req: ReplayRequest) -> Result<LogBatch, IpcError> {
    let ring = state.capture.ring(&req.serial);
    let lines = match &req.filter {
        Some(filter) => ring.snapshot_filtered(filter, req.limit as usize),
        None => ring.snapshot(req.from_seq, req.limit as usize),
    };
    let from_seq = lines.first().map(|l| l.seq).unwrap_or(req.from_seq);
    Ok(LogBatch { serial: req.serial, from_seq, lines, truncated: false })
}

/// `log.export`：导出过滤后缓冲快照为 txt（core 持有全量缓冲）。
#[tauri::command]
pub fn log_export(state: State<'_, AppState>, req: ExportRequest) -> Result<ExportResult, IpcError> {
    let ring = state.capture.ring(&req.serial);
    let result = state
        .export
        .export(&req.serial, &ring, req.filter.as_ref(), ring.capacity())
        .map_err(ipc)?;
    state.app_log.info(format!("日志已导出: {}", result.path));
    Ok(result)
}

/// 内部：设备掉线时取消进程索引（commands::device 调用）。
pub(crate) fn cancel_index(state: &AppState, serial: &str) {
    if let Some(cancel) = state.index_cancels.lock().expect("index lock poisoned").remove(serial) {
        cancel.cancel();
    }
    if let Some(task_id) = state.capture_tasks.lock().expect("capture lock poisoned").remove(serial) {
        state.tasks.finish(task_id);
    }
}
