//! 壳侧拖出：展开描述符树 → 主线程 DoDragDrop → GetData 才 pull。

mod names;
#[cfg(windows)]
mod ole;

use std::fs;
use std::path::Path;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::AppHandle;
use tokio_util::sync::CancellationToken;
use yohu_files::TransferRunner;
use yohu_protocol::{AppEvent, DragOutRequest, IpcError, IpcErrorCode};

use crate::commands::{ipc_code, ipc_file};
use crate::state::AppState;
use crate::tasks::TaskCenter;

use self::names::windows_relative_ok;

/// 启动/退出时清掉上次残留的拖出临时目录。
pub fn cleanup_stale(drag_out_root: &Path) {
    if drag_out_root.exists() {
        let _ = fs::remove_dir_all(drag_out_root);
    }
}

pub async fn drag_out(
    app: &AppHandle,
    state: &AppState,
    req: DragOutRequest,
) -> Result<(), IpcError> {
    if req.remotes.is_empty() {
        return Err(ipc_code(IpcErrorCode::InvalidArgs, "未选择文件"));
    }
    let tree = state
        .browser
        .list_tree(&req.serial, &req.remotes, CancellationToken::new())
        .await
        .map_err(ipc_file)?;
    let items: Vec<_> = tree
        .into_iter()
        .filter(|e| windows_relative_ok(&e.relative))
        .collect();
    if items.is_empty() {
        return Err(ipc_code(
            IpcErrorCode::InvalidArgs,
            "没有可拖出的项目（名称在 Windows 上非法）",
        ));
    }

    let root = state.paths.drag_out_dir();
    fs::create_dir_all(&root).map_err(|e| ipc_code(IpcErrorCode::Internal, e.to_string()))?;
    let session_id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let session_dir = root.join(format!("{session_id}"));
    fs::create_dir_all(&session_dir)
        .map_err(|e| ipc_code(IpcErrorCode::Internal, e.to_string()))?;

    let payload = DragPayload {
        items,
        serial: req.serial,
        session_dir: session_dir.clone(),
        transfers: state.transfers.clone(),
        event_tx: state.event_tx.clone(),
        tasks: Arc::clone(&state.tasks),
        transfer_cancels: Arc::clone(&state.transfer_cancels),
        transfer_next: Arc::clone(&state.transfer_next),
        rt: tokio::runtime::Handle::current(),
    };

    #[cfg(windows)]
    {
        let (tx, rx) = tokio::sync::oneshot::channel();
        app.run_on_main_thread(move || {
            let result = ole::do_drag_drop(payload);
            let _ = tx.send(result);
        })
        .map_err(|e| ipc_code(IpcErrorCode::Internal, e.to_string()))?;
        rx.await
            .map_err(|_| ipc_code(IpcErrorCode::Internal, "拖出已中断"))?
    }
    #[cfg(not(windows))]
    {
        let _ = (app, payload);
        let _ = fs::remove_dir_all(&session_dir);
        Err(ipc_code(IpcErrorCode::Internal, "拖出仅支持 Windows"))
    }
}

pub(crate) struct DragPayload {
    pub items: Vec<yohu_files::TreeEntry>,
    pub serial: String,
    pub session_dir: std::path::PathBuf,
    pub transfers: TransferRunner,
    pub event_tx: tokio::sync::mpsc::Sender<AppEvent>,
    pub tasks: Arc<TaskCenter>,
    pub transfer_cancels: Arc<std::sync::Mutex<std::collections::HashMap<u32, CancellationToken>>>,
    pub transfer_next: Arc<std::sync::atomic::AtomicU32>,
    pub rt: tokio::runtime::Handle,
}
