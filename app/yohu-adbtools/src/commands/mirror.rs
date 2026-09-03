//! 投屏模块命令：薄转发 MirrorService + 壳内 Present（ADR-v6-024）。

use tauri::State;

use crate::commands::{ipc, ipc_code};
use crate::state::AppState;
use yohu_mirror::{MirrorError, MirrorSessionRequest};
use yohu_protocol::{
    IpcError, IpcErrorCode, MirrorInjectRequest, MirrorLayout, MirrorScreenshotRequest, MirrorStart,
    MirrorStartRequest,
};

fn ipc_mirror(e: MirrorError) -> IpcError {
    match e {
        MirrorError::Cancelled => ipc_code(IpcErrorCode::Cancelled, e.to_string()),
        MirrorError::NotLive | MirrorError::NoControl | MirrorError::Protocol(_) => {
            ipc_code(IpcErrorCode::InvalidArgs, e.to_string())
        }
        MirrorError::ServerMissing(_) | MirrorError::ServerFailed(_) => {
            ipc_code(IpcErrorCode::AdbError, e.to_string())
        }
        MirrorError::Adb(adb) => crate::commands::ipc_adb(adb),
        MirrorError::Io(_) => ipc(e),
    }
}

fn expand_start(state: &AppState, req: MirrorStartRequest) -> MirrorSessionRequest {
    let snap = state.settings.snapshot();
    let enc = yohu_domain::start_encode(&snap, &req.connection, req.session_quality_touched);
    let mut codec = enc.video_codec.to_string();
    if codec.eq_ignore_ascii_case("h265") && !state.present.hevc_ok() {
        tracing::warn!(serial = %req.serial, "本机无 HEVC MFT，改用 H.264");
        codec = "h264".into();
    }
    MirrorSessionRequest {
        serial: req.serial,
        control: req.control,
        force_forward: yohu_domain::start_force_forward(&snap, &req.connection),
        max_size: enc.max_size,
        video_bit_rate: enc.video_bit_rate,
        max_fps: enc.max_fps,
        video_codec: codec,
    }
}

#[tauri::command(rename = "mirror.start")]
pub async fn mirror_start(
    state: State<'_, AppState>,
    req: MirrorStartRequest,
) -> Result<MirrorStart, IpcError> {
    start_session(&state, req).await
}

async fn start_session(
    state: &AppState,
    req: MirrorStartRequest,
) -> Result<MirrorStart, IpcError> {
    state.require_online(&req.serial)?;
    let plan = expand_start(state, req);
    tracing::info!(
        serial = %plan.serial,
        control = plan.control,
        force_forward = plan.force_forward,
        codec = %plan.video_codec,
        max_size = plan.max_size,
        bit_rate = plan.video_bit_rate,
        max_fps = plan.max_fps,
        "mirror.start"
    );
    let serial = plan.serial.clone();
    let result = state.mirror.start(plan).await.map_err(|e| {
        tracing::error!(serial = %serial, error = %e, "mirror.start 失败");
        ipc_mirror(e)
    })?;
    tracing::info!(
        serial = %result.serial,
        generation = result.generation,
        adopted = result.adopted,
        "mirror.start 返回"
    );
    if !result.adopted {
        let task_id = state.tasks.register(
            format!("投屏: {}", serial),
            format!("设备 {}", serial),
        );
        state
            .mirror_tasks
            .lock()
            .expect("mirror task lock poisoned")
            .insert(serial.clone(), task_id);
    }
    if let Some(pipe) = state.mirror.frame_pipe(&serial) {
        state.present.attach(&serial, result.generation, pipe);
    }
    Ok(result)
}

#[tauri::command(rename = "mirror.stop")]
pub async fn mirror_stop(state: State<'_, AppState>, serial: String) -> Result<(), IpcError> {
    tracing::info!(serial = %serial, "mirror.stop");
    state.present.detach(&serial);
    state.mirror.stop(&serial).await;
    state.finish_mirror_task(&serial);
    Ok(())
}

#[tauri::command(rename = "mirror.inject")]
pub async fn mirror_inject(
    state: State<'_, AppState>,
    req: MirrorInjectRequest,
) -> Result<(), IpcError> {
    state.require_online(&req.serial)?;
    state
        .mirror
        .inject(&req.serial, req.message)
        .await
        .map_err(ipc_mirror)
}

#[tauri::command(rename = "mirror.closeControl")]
pub fn mirror_close_control(state: State<'_, AppState>, serial: String) -> Result<(), IpcError> {
    state.mirror.close_control(&serial).map_err(ipc_mirror)
}

#[tauri::command(rename = "mirror.layout")]
pub async fn mirror_layout(state: State<'_, AppState>, req: MirrorLayout) -> Result<(), IpcError> {
    state.present.layout(req);
    Ok(())
}

#[tauri::command(rename = "mirror.screenshot")]
pub fn mirror_screenshot(
    state: State<'_, AppState>,
    req: MirrorScreenshotRequest,
) -> Result<(), IpcError> {
    state
        .present
        .screenshot(&req.serial, &req.path)
        .map_err(|e| ipc_code(IpcErrorCode::Internal, e))?;
    state.app_log.info(format!("投屏截图已保存: {}", req.path));
    Ok(())
}
