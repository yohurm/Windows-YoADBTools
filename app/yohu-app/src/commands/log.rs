//! 日志模块命令：薄转发 CaptureService / ExportService。

use crate::commands::{err_internal, err_code};
use crate::state::AppState;
use yohu_logsrv::LogError;
use yohu_protocol::{
    CaptureStart, CaptureStatus, ExportRequest, ExportResult, AppError, ErrorCode, LogBatch,
    ProcessEntry, ReplayRequest,
};

pub async fn log_capture_start(
    state: &AppState,
    serial: String,
) -> Result<CaptureStart, AppError> {
    state.require_online(&serial)?;
    let snap = state.settings.snapshot();
    state.capture.set_ring_capacity(snap.buffer_capacity);
    let clear = snap.clear_device_on_start;
    let result = match state.capture.start(&serial, clear).await {
        Ok(result) => result,
        Err(LogError::Cancelled) => {
            return Err(err_code(ErrorCode::Cancelled, "采集已取消"));
        }
        Err(e) => return Err(err_internal(e)),
    };

    if !result.adopted {
        let task_id = state
            .tasks
            .register(format!("logcat 采集: {serial}"), format!("设备 {serial}"));
        state
            .capture_tasks
            .lock()
            .expect("capture lock poisoned")
            .insert(serial, task_id);
    }
    Ok(result)
}

pub async fn log_capture_stop(state: &AppState, serial: String) -> Result<(), AppError> {
    state.capture.stop(&serial).await;
    state.finish_capture_task(&serial);
    Ok(())
}

pub fn log_capture_status(state: &AppState, serial: String) -> CaptureStatus {
    state.capture.status(&serial)
}

pub fn log_clear(state: &AppState, serial: String) -> Result<(), AppError> {
    state.capture.clear(&serial);
    Ok(())
}

pub async fn log_clear_device(state: &AppState, serial: String) -> Result<(), AppError> {
    state
        .capture
        .clear_device_buffer(&serial)
        .await
        .map_err(err_internal)
}

pub fn log_replay(state: &AppState, req: ReplayRequest) -> Result<LogBatch, AppError> {
    let ring = state.capture.ring(&req.serial);
    let (lines, truncated) = match &req.filter {
        Some(filter) => {
            let lines = ring.snapshot_filtered(filter, req.limit as usize);
            (lines, false)
        }
        None => ring.snapshot_page(req.from_seq, req.limit as usize),
    };
    let from_seq = lines.first().map(|l| l.seq).unwrap_or(req.from_seq);
    Ok(LogBatch {
        serial: req.serial,
        from_seq,
        lines,
        truncated,
    })
}

pub fn log_export(
    state: &AppState,
    req: ExportRequest,
) -> Result<ExportResult, AppError> {
    let ring = state.capture.ring(&req.serial);
    let settings = state.settings.snapshot();
    let dest = yohu_logsrv::ExportService::resolve_dest(
        req.path.as_deref(),
        &settings.export_default_path,
        &req.serial,
    );
    let result = state
        .export
        .export(
            &req.serial,
            &ring,
            req.filter.as_ref(),
            ring.capacity(),
            dest.as_deref(),
            req.write_mode,
        )
        .map_err(err_internal)?;
    state.app_log.info(format!("日志已导出: {}", result.path));
    Ok(result)
}

pub async fn log_process_snapshot(
    state: &AppState,
    serial: String,
) -> Result<Vec<ProcessEntry>, AppError> {
    state.capture.process_snapshot(&serial).await.map_err(err_internal)
}
