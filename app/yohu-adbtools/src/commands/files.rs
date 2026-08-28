//! 文件模块命令：浏览/传输/取消/删除/新建。

use tauri::{AppHandle, Manager, State};
use tokio_util::sync::CancellationToken;

use crate::commands::ipc_file;
use crate::state::AppState;
use yohu_protocol::{
    Direction, DragOutRequest, IpcError, PathOpRequest, RemoteEntry, TransferRequest,
};

/// `files.list`：浏览设备目录。
#[tauri::command(rename = "files.list")]
pub async fn files_list(
    state: State<'_, AppState>,
    serial: String,
    path: String,
) -> Result<Vec<RemoteEntry>, IpcError> {
    state.require_online(&serial)?;
    tracing::info!(serial = %serial, path = %path, "files.list");
    let cancel = {
        let mut slot = state.browse_cancel.lock().expect("browse lock poisoned");
        slot.cancel();
        let next = CancellationToken::new();
        *slot = next.clone();
        next
    };
    state
        .browser
        .list(&serial, &path, cancel)
        .await
        .map_err(ipc_file)
}

/// `files.push`：本机 → 设备（异步传输，进度经 `transfer.progress` 事件）。
#[tauri::command(rename = "files.push")]
pub async fn files_push(
    state: State<'_, AppState>,
    app: AppHandle,
    req: TransferRequest,
) -> Result<u32, IpcError> {
    spawn_transfer(state, app, req, Direction::Push)
}

/// `files.pull`：设备 → 本机。
#[tauri::command(rename = "files.pull")]
pub async fn files_pull(
    state: State<'_, AppState>,
    app: AppHandle,
    req: TransferRequest,
) -> Result<u32, IpcError> {
    spawn_transfer(state, app, req, Direction::Pull)
}

fn spawn_transfer(
    state: State<'_, AppState>,
    app: AppHandle,
    req: TransferRequest,
    direction: Direction,
) -> Result<u32, IpcError> {
    state.require_online(&req.serial)?;
    let id = state
        .transfer_next
        .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        + 1;
    let cancel = CancellationToken::new();
    state
        .transfer_cancels
        .lock()
        .expect("transfer lock poisoned")
        .insert(id, cancel.clone());

    let task_id = state.tasks.register(
        match direction {
            Direction::Push => format!("上传: {}", req.remote),
            Direction::Pull => format!("下载: {}", req.local),
        },
        match direction {
            Direction::Push => format!("{} → {}", req.local, req.remote),
            Direction::Pull => format!("{} → {}", req.remote, req.local),
        },
    );

    let transfers = state.transfers.clone();
    let sink = state.event_tx.clone();
    let spec = yohu_files::TransferSpec {
        id,
        serial: req.serial.clone(),
        direction,
        local: req.local.clone(),
        remote: req.remote.clone(),
    };
    tokio::spawn(async move {
        let result = transfers.run(spec, cancel, sink).await;
        let state = app.state::<AppState>();
        state
            .transfer_cancels
            .lock()
            .expect("transfer lock poisoned")
            .remove(&id);
        state.tasks.finish(task_id);
        if let Err(e) = result {
            state.app_log.error(format!("传输失败: {e}"));
        }
    });
    Ok(id)
}

/// `files.cancel`：取消传输。
#[tauri::command(rename = "files.cancel")]
pub fn files_cancel(state: State<'_, AppState>, id: u32) -> Result<(), IpcError> {
    let cancel = state
        .transfer_cancels
        .lock()
        .expect("transfer lock poisoned")
        .get(&id)
        .cloned();
    match cancel {
        Some(c) => {
            c.cancel();
            Ok(())
        }
        // 传输已结束：invoke 返回前卡可能仍显示 running，取消必须可关。
        None => Ok(()),
    }
}

/// `files.delete`：删除（core 侧 SafetyRoot 强制校验，ADR-v6-013）。
#[tauri::command(rename = "files.delete")]
pub async fn files_delete(state: State<'_, AppState>, req: PathOpRequest) -> Result<(), IpcError> {
    state.require_online(&req.serial)?;
    state
        .mutator
        .delete(&req.serial, &req.path, CancellationToken::new())
        .await
        .map_err(ipc_file)
}

/// `files.mkdir`：新建目录。
#[tauri::command(rename = "files.mkdir")]
pub async fn files_mkdir(state: State<'_, AppState>, req: PathOpRequest) -> Result<(), IpcError> {
    state.require_online(&req.serial)?;
    state
        .mutator
        .mkdir(&req.serial, &req.path, CancellationToken::new())
        .await
        .map_err(ipc_file)
}

/// `files.create`：新建空文件（SafetyRoot 校验）。
#[tauri::command(rename = "files.create")]
pub async fn files_create(state: State<'_, AppState>, req: PathOpRequest) -> Result<(), IpcError> {
    state.require_online(&req.serial)?;
    state
        .mutator
        .create_file(&req.serial, &req.path, CancellationToken::new())
        .await
        .map_err(ipc_file)
}

/// `files.dragOut`：虚拟文件拖出（DoDragDrop 结束后返回）。OLE 在 `dnd/`。
#[tauri::command(rename = "files.dragOut")]
pub async fn files_drag_out(
    state: State<'_, AppState>,
    app: AppHandle,
    req: DragOutRequest,
) -> Result<(), IpcError> {
    state.require_online(&req.serial)?;
    crate::dnd::drag_out(&app, &state, req).await
}
