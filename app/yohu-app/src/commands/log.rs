//! 日志模块命令：薄转发 CaptureService / ExportService。

use tauri::State;

use crate::commands::{ipc, ipc_code};
use crate::state::AppState;
use yohu_logsrv::LogError;
use yohu_protocol::{
    ExportRequest, ExportResult, IpcError, IpcErrorCode, LogBatch, ProcessEntry, ReplayRequest,
};

#[tauri::command(rename = "log.capture.start")]
pub async fn log_capture_start(state: State<'_, AppState>, serial: String) -> Result<(), IpcError> {
    let snap = state.settings.snapshot();
    state.capture.set_ring_capacity(snap.buffer_capacity);
    let clear = snap.clear_device_on_start;
    match state.capture.start(&serial, clear).await {
        Ok(()) => {}
        Err(LogError::AlreadyRunning) => {
            return Err(ipc_code(IpcErrorCode::AlreadyRunning, "该设备已在采集中"));
        }
        Err(LogError::Cancelled) => {
            return Err(ipc_code(IpcErrorCode::Cancelled, "采集已取消"));
        }
        Err(e) => return Err(ipc(e)),
    }

    let task_id = state
        .tasks
        .register(format!("logcat 采集: {serial}"), format!("设备 {serial}"));
    state
        .capture_tasks
        .lock()
        .expect("capture lock poisoned")
        .insert(serial, task_id);
    Ok(())
}

#[tauri::command(rename = "log.capture.stop")]
pub async fn log_capture_stop(state: State<'_, AppState>, serial: String) -> Result<(), IpcError> {
    state.capture.stop(&serial).await;
    state.finish_capture_task(&serial);
    Ok(())
}

#[tauri::command(rename = "log.clear")]
pub fn log_clear(state: State<'_, AppState>, serial: String) -> Result<(), IpcError> {
    state.capture.clear(&serial);
    Ok(())
}

#[tauri::command(rename = "log.clearDevice")]
pub async fn log_clear_device(state: State<'_, AppState>, serial: String) -> Result<(), IpcError> {
    state.capture.clear_device_buffer(&serial).await.map_err(ipc)
}

#[tauri::command(rename = "log.replay")]
pub fn log_replay(state: State<'_, AppState>, req: ReplayRequest) -> Result<LogBatch, IpcError> {
    let ring = state.capture.ring(&req.serial);
    let (lines, truncated) = match &req.filter {
        Some(filter) => {
            let lines = ring.snapshot_filtered(filter, req.limit as usize);
            (lines, false)
        }
        None => ring.snapshot_page(req.from_seq, req.limit as usize),
    };
    let from_seq = lines.first().map(|l| l.seq).unwrap_or(req.from_seq);
    Ok(LogBatch { serial: req.serial, from_seq, lines, truncated })
}

#[tauri::command(rename = "log.export")]
pub fn log_export(state: State<'_, AppState>, req: ExportRequest) -> Result<ExportResult, IpcError> {
    let ring = state.capture.ring(&req.serial);
    let settings = state.settings.snapshot();
    let dest = req.path.filter(|p| !p.is_empty()).or_else(|| {
        if settings.export_default_path.is_empty() {
            None
        } else {
            Some(format!(
                "{}/logcat-{}.txt",
                settings.export_default_path.trim_end_matches(['/', '\\']),
                req.serial
            ))
        }
    });
    let result = state
        .export
        .export(
            &req.serial,
            &ring,
            req.filter.as_ref(),
            ring.capacity(),
            dest.as_deref().map(std::path::Path::new),
            req.write_mode,
        )
        .map_err(ipc)?;
    state.app_log.info(format!("日志已导出: {}", result.path));
    Ok(result)
}

#[tauri::command(rename = "log.processSnapshot")]
pub async fn log_process_snapshot(
    state: State<'_, AppState>,
    serial: String,
) -> Result<Vec<ProcessEntry>, IpcError> {
    state.capture.process_snapshot(&serial).await.map_err(ipc)
}

#[tauri::command(rename = "log.dump")]
pub async fn log_dump(state: State<'_, AppState>, serial: String) -> Result<u64, IpcError> {
    state.capture.dump_into_ring(&serial).await.map_err(ipc)
}
