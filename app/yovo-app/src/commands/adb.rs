//! 通用 adb 执行命令（终端自由命令用）。

use tauri::State;
use tokio_util::sync::CancellationToken;

use crate::commands::ipc_adb;
use crate::state::AppState;
use yovo_protocol::{AdbExecRequest, ExecOutcome, IpcError};

/// `adb.exec`：短命令，返回原始结果（不判定成败，ADR-v6-009）。
#[tauri::command]
pub async fn adb_exec(
    state: State<'_, AppState>,
    req: AdbExecRequest,
) -> Result<ExecOutcome, IpcError> {
    state
        .client
        .run(&req.serial, &req.argv, req.timeout_ms, CancellationToken::new())
        .await
        .map_err(ipc_adb)
}
