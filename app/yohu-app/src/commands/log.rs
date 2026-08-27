//! 日志模块命令：薄转发 CaptureService / SessionLogService。

use std::path::PathBuf;

use tauri::State;

use crate::commands::{ipc, ipc_code};
use crate::state::AppState;
use yohu_logsrv::LogError;
use yohu_protocol::{
    CaptureStart, CaptureStatus, ExportRequest, ExportResult, IpcError, IpcErrorCode, LogBatch,
    ProcessEntry, ReplayRequest, SessionFileAppendRequest, SessionFileCloseRequest,
    SessionFileInfo, SessionFileRequest, SessionLogFile,
};

#[tauri::command(rename = "log.capture.start")]
pub async fn log_capture_start(
    state: State<'_, AppState>,
    serial: String,
) -> Result<CaptureStart, IpcError> {
    tracing::info!(serial = %serial, "log.capture.start");
    state.require_online(&serial)?;
    let snap = state.settings.snapshot();
    state.capture.set_ring_capacity(snap.buffer_capacity);
    let clear = snap.clear_device_on_start;
    let result = match state.capture.start(&serial, clear).await {
        Ok(result) => result,
        Err(LogError::Cancelled) => {
            return Err(ipc_code(IpcErrorCode::Cancelled, "采集已取消"));
        }
        Err(e) => return Err(ipc(e)),
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

#[tauri::command(rename = "log.capture.stop")]
pub async fn log_capture_stop(state: State<'_, AppState>, serial: String) -> Result<(), IpcError> {
    state.capture.stop(&serial).await;
    state.finish_capture_task(&serial);
    Ok(())
}

#[tauri::command(rename = "log.capture.status")]
pub fn log_capture_status(state: State<'_, AppState>, serial: String) -> CaptureStatus {
    state.capture.status(&serial)
}

#[tauri::command(rename = "log.clear")]
pub fn log_clear(state: State<'_, AppState>, serial: String) -> Result<(), IpcError> {
    state.capture.clear(&serial);
    Ok(())
}

#[tauri::command(rename = "log.clearDevice")]
pub async fn log_clear_device(state: State<'_, AppState>, serial: String) -> Result<(), IpcError> {
    state
        .capture
        .clear_device_buffer(&serial)
        .await
        .map_err(ipc)
}

#[tauri::command(rename = "log.replay")]
pub fn log_replay(state: State<'_, AppState>, req: ReplayRequest) -> Result<LogBatch, IpcError> {
    let ring = state.capture.ring(&req.serial);
    let (lines, truncated) = match &req.filter {
        Some(filter) => {
            let lines = ring.snapshot_filtered_from(req.from_seq, filter, req.limit as usize);
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

// ===== 实时逐窗口日志文件（日志写入方式） =====

/// `log.sessionFileOpen`：为某窗口新建实时日志文件。
#[tauri::command(rename = "log.sessionFileOpen")]
pub fn log_session_file_open(
    state: State<'_, AppState>,
    req: SessionFileRequest,
) -> Result<SessionFileInfo, IpcError> {
    state
        .session_log
        .open(&req.serial, req.window_id, &req.name, req.mode)
        .map_err(ipc)
}

/// `log.sessionFileAppend`：追加一批 UI 已过滤行。
#[tauri::command(rename = "log.sessionFileAppend")]
pub fn log_session_file_append(
    state: State<'_, AppState>,
    req: SessionFileAppendRequest,
) -> Result<u64, IpcError> {
    state
        .session_log
        .append(&req.serial, req.window_id, &req.lines)
        .map_err(ipc)
}

/// `log.sessionFileClose`：结束某窗口日志文件。
#[tauri::command(rename = "log.sessionFileClose")]
pub fn log_session_file_close(
    state: State<'_, AppState>,
    req: SessionFileCloseRequest,
) -> Result<String, IpcError> {
    state
        .session_log
        .close(&req.serial, req.window_id)
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(ipc)
}

/// `log.sessionFileLatest`：当前窗口最新日志文件路径（导出「最新」用）。
#[tauri::command(rename = "log.sessionFileLatest")]
pub fn log_session_file_latest(
    state: State<'_, AppState>,
    serial: String,
    window_id: u32,
) -> Result<Option<String>, IpcError> {
    Ok(state
        .session_log
        .latest(&serial, window_id)
        .map(|p| p.to_string_lossy().into_owned()))
}

/// `log.sessionFileList`：列出全部窗口日志文件（多选导出对话框用）。
#[tauri::command(rename = "log.sessionFileList")]
pub fn log_session_file_list(state: State<'_, AppState>) -> Result<Vec<SessionLogFile>, IpcError> {
    state.session_log.list().map_err(ipc)
}

/// `log.export`：把选定实时日志文件合并导出为一份 txt。
#[tauri::command(rename = "log.export")]
pub fn log_export(state: State<'_, AppState>, req: ExportRequest) -> Result<ExportResult, IpcError> {
    let settings = state.settings.snapshot();
    let dest = export_dest(req.path.as_deref(), &settings.export_default_path);
    let result = state
        .session_log
        .export(&req.sources, dest.as_deref())
        .map_err(ipc)?;
    state.app_log.info(format!("日志已导出: {}", result.path));
    Ok(result)
}

/// 目标路径：用户指定优先；否则默认导出目录 + 固定文件名；都空由 core 生成。
fn export_dest(requested: Option<&str>, default_dir: &str) -> Option<PathBuf> {
    if let Some(p) = requested.filter(|s| !s.is_empty()) {
        return Some(PathBuf::from(p));
    }
    if default_dir.is_empty() {
        return None;
    }
    let dir = default_dir.trim_end_matches(['/', '\\']);
    Some(PathBuf::from(format!("{dir}/logcat-export.txt")))
}

#[tauri::command(rename = "log.processSnapshot")]
pub async fn log_process_snapshot(
    state: State<'_, AppState>,
    serial: String,
) -> Result<Vec<ProcessEntry>, IpcError> {
    state.capture.process_snapshot(&serial).await.map_err(ipc)
}
