//! 终端域命令：单命令判定 / 命令组编排。

use tauri::{AppHandle, Manager, State};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::commands::{ipc_adb, ipc_code};
use crate::state::AppState;
use yovo_domain::{CommandDefinition, CommandEvaluator, GroupExecutor, Verdict, split_command_line};
use yovo_protocol::{
    AppEvent, CommandDto, GroupProgress, GroupRunRequest, IpcError, IpcErrorCode,
};

/// 单命令判定结果（wire）。
#[derive(serde::Serialize)]
pub struct EvalResult {
    pub ok: bool,
    pub message: String,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// `terminal.eval`：执行一条命令并做领域判定。
#[tauri::command]
pub async fn terminal_eval(
    state: State<'_, AppState>,
    serial: String,
    command: CommandDto,
) -> Result<EvalResult, IpcError> {
    let definition = CommandDefinition::from_dto(&command);
    let argv = split_command_line(&definition.template);
    let outcome = state
        .client
        .run(&serial, &argv, None, CancellationToken::new())
        .await
        .map_err(ipc_adb)?;
    let verdict = CommandEvaluator::evaluate(&definition, &outcome);
    let (ok, message) = match verdict {
        Verdict::Pass => (true, String::new()),
        Verdict::Fail { reason } => (false, reason),
    };
    Ok(EvalResult {
        ok,
        message,
        exit_code: outcome.exit_code,
        stdout: outcome.stdout,
        stderr: outcome.stderr,
    })
}

/// `group.run`：命令组编排（多设备并行/组内串行/延时/失败中断）。
#[tauri::command]
pub async fn group_run(
    state: State<'_, AppState>,
    app: AppHandle,
    req: GroupRunRequest,
) -> Result<u32, IpcError> {
    let group = state
        .library
        .lock()
        .expect("library lock poisoned")
        .group(&req.group_id)
        .cloned()
        .ok_or_else(|| ipc_code(IpcErrorCode::NotFound, format!("命令组不存在: {}", req.group_id)))?;

    let run_id = state.group_next.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
    let cancel = CancellationToken::new();
    state.group_runs.lock().expect("group lock poisoned").insert(run_id, cancel.clone());

    let task_id = state.tasks.register(format!("命令组: {}", group.name));
    let (tx, mut rx) = mpsc::channel::<yovo_domain::GroupRunEvent>(64);
    let sink = state.event_tx.clone();
    let serials = req.serials.clone();

    tokio::spawn(async move {
        // 进度转发循环
        let forward = tokio::spawn(async move {
            while let Some(e) = rx.recv().await {
                let message = match &e.verdict {
                    Verdict::Pass => e.message,
                    Verdict::Fail { reason } => reason.clone(),
                };
                let _ = sink.try_send(AppEvent::GroupProgress(GroupProgress {
                    run_id,
                    serial: e.serial,
                    ok: e.verdict.is_pass(),
                    message: if message.is_empty() { None } else { Some(message) },
                }));
            }
        });

        let executor = GroupExecutor::new({
            let state = app.state::<AppState>();
            state.client.clone()
        });
        executor.run(&group.commands, &serials, tx, cancel).await;
        let _ = forward.await;

        let state = app.state::<AppState>();
        state.group_runs.lock().expect("group lock poisoned").remove(&run_id);
        state.tasks.finish(task_id);
    });

    Ok(run_id)
}

/// `group.cancel`：取消命令组运行。
#[tauri::command]
pub fn group_cancel(state: State<'_, AppState>, run_id: u32) -> Result<(), IpcError> {
    let cancel = state
        .group_runs
        .lock()
        .expect("group lock poisoned")
        .get(&run_id)
        .cloned();
    match cancel {
        Some(c) => {
            c.cancel();
            Ok(())
        }
        None => Err(ipc_code(IpcErrorCode::NotFound, format!("运行不存在: {run_id}"))),
    }
}
