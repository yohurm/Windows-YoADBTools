//! 文件模块命令：浏览/传输/取消/删除/新建。

use std::sync::Arc;

use tokio_util::sync::CancellationToken;

use crate::commands::err_file;
use crate::state::AppState;
use yohu_protocol::{
    Direction, DragOutRequest, AppError, PathOpRequest, RemoteEntry, TransferRequest,
};

/// `files.list`：浏览设备目录。
pub async fn files_list(
    state: &AppState,
    serial: String,
    path: String,
) -> Result<Vec<RemoteEntry>, AppError> {
    state.require_online(&serial)?;
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
        .map_err(err_file)
}

/// `files.push`：本机 → 设备（异步传输，进度经 `transfer.progress` 事件）。
pub async fn files_push(
    state: &Arc<AppState>,
    req: TransferRequest,
) -> Result<u32, AppError> {
    spawn_transfer(state, req, Direction::Push)
}

/// `files.pull`：设备 → 本机。
pub async fn files_pull(
    state: &Arc<AppState>,
    req: TransferRequest,
) -> Result<u32, AppError> {
    spawn_transfer(state, req, Direction::Pull)
}

fn spawn_transfer(
    state: &Arc<AppState>,
    req: TransferRequest,
    direction: Direction,
) -> Result<u32, AppError> {
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
    let state = Arc::clone(state);
    tokio::spawn(async move {
        let result = transfers.run(spec, cancel, sink).await;
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
pub fn files_cancel(state: &AppState, id: u32) -> Result<(), AppError> {
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
        // 传输已结束：调用返回前卡可能仍显示 running，取消必须可关。
        None => Ok(()),
    }
}

/// `files.delete`：删除（core 侧 SafetyRoot 强制校验，ADR-slint-013）。
pub async fn files_delete(state: &AppState, req: PathOpRequest) -> Result<(), AppError> {
    state.require_online(&req.serial)?;
    state
        .mutator
        .delete(&req.serial, &req.path, CancellationToken::new())
        .await
        .map_err(err_file)
}

/// `files.mkdir`：新建目录。
pub async fn files_mkdir(state: &AppState, req: PathOpRequest) -> Result<(), AppError> {
    state.require_online(&req.serial)?;
    state
        .mutator
        .mkdir(&req.serial, &req.path, CancellationToken::new())
        .await
        .map_err(err_file)
}

/// `files.create`：新建空文件（SafetyRoot 校验）。
pub async fn files_create(state: &AppState, req: PathOpRequest) -> Result<(), AppError> {
    state.require_online(&req.serial)?;
    state
        .mutator
        .create_file(&req.serial, &req.path, CancellationToken::new())
        .await
        .map_err(err_file)
}

/// `files.dragOut`：虚拟文件拖出（DoDragDrop 结束后返回）。OLE 在 `dnd/`。
pub async fn files_drag_out(
    state: &Arc<AppState>,
    req: DragOutRequest,
) -> Result<(), AppError> {
    state.require_online(&req.serial)?;
    crate::dnd::drag_out(state, req).await
}
