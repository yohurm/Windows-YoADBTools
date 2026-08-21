//! 终端域命令：单命令判定 / 命令组编排（薄转发）。
//! 占位符填充与多设备并行在 domain；本层只查库、在线校验、转发。

use tauri::{AppHandle, State};
use tokio_util::sync::CancellationToken;

use crate::commands::{ipc_code, ipc_run};
use crate::state::AppState;
use yohu_domain::{run_and_evaluate, LibraryError};
use yohu_protocol::{
    EvalResult, GroupRunRequest, IpcError, IpcErrorCode, SerialEvalResult, TerminalEvalRequest,
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
    let client = state.client.clone();
    let mut handles = Vec::with_capacity(req.serials.len());
    for serial in req.serials {
        let client = client.clone();
        let command = filled.clone();
        handles.push(tokio::spawn(async move {
            match run_and_evaluate(
                client.as_ref(),
                &serial,
                &command,
                CancellationToken::new(),
            )
            .await
            {
                Ok(evaluated) => from_eval(&serial, evaluated.into_eval_result()),
                Err(error) => {
                    let mapped = ipc_run(error);
                    SerialEvalResult {
                        serial,
                        ok: false,
                        message: mapped.message,
                        exit_code: -1,
                        stdout: String::new(),
                        stderr: String::new(),
                        duration_ms: 0,
                    }
                }
            }
        }));
    }
    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        results.push(handle.await.map_err(|e| ipc_code(IpcErrorCode::Internal, e.to_string()))?);
    }
    Ok(results)
}

fn from_eval(serial: &str, result: EvalResult) -> SerialEvalResult {
    SerialEvalResult {
        serial: serial.to_string(),
        ok: result.ok,
        message: result.message,
        exit_code: result.exit_code,
        stdout: result.stdout,
        stderr: result.stderr,
        duration_ms: result.duration_ms,
    }
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
