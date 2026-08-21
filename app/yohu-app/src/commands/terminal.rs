//! 终端域命令：单命令判定 / 命令组编排（薄转发）。

use tauri::{AppHandle, State};
use tokio_util::sync::CancellationToken;

use crate::commands::{ipc_code, ipc_run};
use crate::state::AppState;
use yohu_domain::{run_and_evaluate, CommandDefinition};
use yohu_protocol::{CommandDto, EvalResult, GroupRunRequest, IpcError, IpcErrorCode};

/// `terminal.eval`：执行一条命令并做领域判定。
#[tauri::command(rename = "terminal.eval")]
pub async fn terminal_eval(
    state: State<'_, AppState>,
    serial: String,
    command: CommandDto,
) -> Result<EvalResult, IpcError> {
    state.require_online(&serial)?;
    let definition = CommandDefinition::from_dto(&command);
    let evaluated = run_and_evaluate(
        state.client.as_ref(),
        &serial,
        &definition,
        CancellationToken::new(),
    )
    .await
    .map_err(ipc_run)?;
    Ok(evaluated.into_eval_result())
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
    Ok(crate::group_runs::start(app, &state, group, req.serials))
}

/// `group.cancel`：取消命令组运行。
#[tauri::command(rename = "group.cancel")]
pub fn group_cancel(state: State<'_, AppState>, run_id: u32) -> Result<(), IpcError> {
    crate::group_runs::cancel(&state, run_id)
}
