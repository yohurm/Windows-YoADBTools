//! 终端域命令：单命令判定 / 命令组编排（薄转发）。
//! 占位符填充与多设备并行判定在 domain / `terminal_eval` 服务；本层只查库、在线校验、转发。

use tauri::{AppHandle, State};

use crate::commands::ipc_code;
use crate::state::AppState;
use yohu_domain::LibraryError;
use yohu_protocol::{
    GroupRunRequest, IpcError, IpcErrorCode, SerialEvalResult, TerminalEvalRequest,
};

/// `terminal.eval`：按命令库 id 填充占位符，对 serials 并行执行并判定。
#[tauri::command(rename = "terminal.eval")]
pub async fn terminal_eval(
    state: State<'_, AppState>,
    req: TerminalEvalRequest,
) -> Result<Vec<SerialEvalResult>, IpcError> {
    state.require_online_many(&req.serials)?;
    let definition = {
        let library = state.library.lock().expect("library lock poisoned");
        library.command(&req.command_id).cloned().ok_or_else(|| {
            ipc_code(
                IpcErrorCode::NotFound,
                format!("命令不存在: {}", req.command_id),
            )
        })?
    };
    let filled = definition.fill(&req.values).map_err(ipc_library)?;
    crate::terminal_eval::eval_parallel(state.client.clone(), filled, req.serials).await
}

fn ipc_library(error: LibraryError) -> IpcError {
    ipc_code(IpcErrorCode::InvalidArgs, error.to_string())
}

/// `group.run`：命令组编排（多设备并行/组内串行/延时/失败中断）。
#[tauri::command(rename = "group.run")]
pub async fn group_run(
    state: State<'_, AppState>,
    app: AppHandle,
    req: GroupRunRequest,
) -> Result<u32, IpcError> {
    state.require_online_many(&req.serials)?;
    let group = state
        .library
        .lock()
        .expect("library lock poisoned")
        .group(&req.group_id)
        .cloned()
        .ok_or_else(|| {
            ipc_code(
                IpcErrorCode::NotFound,
                format!("命令组不存在: {}", req.group_id),
            )
        })?;
    if let Some(command) = group.first_command_needing_values() {
        return Err(ipc_library(LibraryError::GroupNeedsValues {
            group_id: group.id.clone(),
            command_id: command.id.clone(),
        }));
    }
    Ok(crate::group_runs::start(app, &state, group, req.serials))
}

/// `group.cancel`：取消命令组运行。
#[tauri::command(rename = "group.cancel")]
pub fn group_cancel(state: State<'_, AppState>, run_id: u32) -> Result<(), IpcError> {
    crate::group_runs::cancel(&state, run_id)
}
