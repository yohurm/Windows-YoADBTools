//! 壳侧拖出：展开描述符树 → 主线程 DoDragDrop → GetData 才 pull。

mod names;
#[cfg(windows)]
mod ole;

use std::fs;
use std::path::Path;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use tokio_util::sync::CancellationToken;
use yohu_files::TransferRunner;
use yohu_protocol::{AppEvent, DragOutRequest, AppError, ErrorCode};

use crate::commands::{err_code, err_file};
use crate::state::AppState;
use crate::tasks::TaskCenter;

use self::names::windows_relative_ok;

/// 启动/退出时清掉上次残留的拖出临时目录。
pub fn cleanup_stale(drag_out_root: &Path) {
    if drag_out_root.exists() {
        let _ = fs::remove_dir_all(drag_out_root);
    }
}

pub async fn drag_out(state: &Arc<AppState>, req: DragOutRequest) -> Result<(), AppError> {
    if req.remotes.is_empty() {
        return Err(err_code(ErrorCode::InvalidArgs, "未选择文件"));
    }
    let tree = state
        .browser
        .list_tree(&req.serial, &req.remotes, CancellationToken::new())
        .await
        .map_err(err_file)?;
    let items: Vec<_> = tree
        .into_iter()
        .filter(|e| windows_relative_ok(&e.relative))
        .collect();
    if items.is_empty() {
        return Err(err_code(
            ErrorCode::InvalidArgs,
            "没有可拖出的项目（名称在 Windows 上非法）",
        ));
    }

    let root = state.paths.drag_out_dir();
    fs::create_dir_all(&root).map_err(|e| err_code(ErrorCode::Internal, e.to_string()))?;
    let session_id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let session_dir = root.join(format!("{session_id}"));
    fs::create_dir_all(&session_dir)
        .map_err(|e| err_code(ErrorCode::Internal, e.to_string()))?;

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
        // OLE DoDragDrop 需要 STA 主线程。由调用方保证在 UI 线程执行；
        // 当前无 UI 阶段直接在本线程运行（未来 rust-slint 接入时改为 UI 线程回调）。
        ole::do_drag_drop(payload)
    }
    #[cfg(not(windows))]
    {
        let _ = payload;
        let _ = fs::remove_dir_all(&session_dir);
        Err(err_code(ErrorCode::Internal, "拖出仅支持 Windows"))
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
