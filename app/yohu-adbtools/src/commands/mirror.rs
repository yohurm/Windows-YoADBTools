//! 投屏模块命令：薄转发 MirrorService。壳泵 FramePipe → Tauri Channel。

use tauri::ipc::Channel;
use tauri::State;

use crate::commands::{ipc, ipc_code};
use crate::state::AppState;
use yohu_mirror::{encode_frame, MirrorError};
use yohu_protocol::{
    IpcError, IpcErrorCode, MirrorInjectRequest, MirrorSavePngRequest, MirrorStart,
    MirrorStartRequest, MirrorStatus,
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

#[tauri::command(rename = "mirror.start")]
pub async fn mirror_start(
    state: State<'_, AppState>,
    req: MirrorStartRequest,
    packets: Channel<Vec<u8>>,
) -> Result<MirrorStart, IpcError> {
    tracing::info!(
        serial = %req.serial,
        control = req.control,
        force_forward = req.force_forward,
        "mirror.start"
    );
    state.require_online(&req.serial)?;
    let result = state.mirror.start(req.clone()).await.map_err(|e| {
        tracing::error!(serial = %req.serial, error = %e, "mirror.start 失败");
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
            format!("投屏: {}", req.serial),
            format!("设备 {}", req.serial),
        );
        state
            .mirror_tasks
            .lock()
            .expect("mirror task lock poisoned")
            .insert(req.serial.clone(), task_id);
        if let Some(pipe) = state.mirror.frame_pipe(&req.serial) {
            tauri::async_runtime::spawn(async move {
                while let Some(frame) = pipe.recv().await {
                    if packets.send(encode_frame(&frame)).is_err() {
                        break;
                    }
                }
            });
        }
    }
    Ok(result)
}

#[tauri::command(rename = "mirror.stop")]
pub async fn mirror_stop(state: State<'_, AppState>, serial: String) -> Result<(), IpcError> {
    tracing::info!(serial = %serial, "mirror.stop");
    state.mirror.stop(&serial).await;
    state.finish_mirror_task(&serial);
    Ok(())
}

#[tauri::command(rename = "mirror.status")]
pub fn mirror_status(state: State<'_, AppState>, serial: String) -> MirrorStatus {
    state.mirror.status(&serial)
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

#[tauri::command(rename = "mirror.savePng")]
pub fn mirror_save_png(
    state: State<'_, AppState>,
    req: MirrorSavePngRequest,
) -> Result<(), IpcError> {
    yohu_mirror::save_png(&req.path, &req.data_b64).map_err(ipc_mirror)?;
    state.app_log.info(format!("投屏截图已保存: {}", req.path));
    Ok(())
}
