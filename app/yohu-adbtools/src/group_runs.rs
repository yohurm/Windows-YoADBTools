//! 命令组运行生命周期：任务中心登记、进度转发、取消。判定仍在 domain GroupExecutor。

use tauri::{AppHandle, Manager};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::commands::{ipc_code, ipc_library};
use crate::state::AppState;
use yohu_domain::{CommandGroup, GroupExecutor, LibraryError, Verdict};
use yohu_protocol::{AppEvent, GroupProgress, GroupRunRequest, IpcError, IpcErrorCode};

/// 查库、校验占位符、登记并异步跑一组命令；立即返回 run_id。
pub fn start(app: AppHandle, state: &AppState, req: GroupRunRequest) -> Result<u32, IpcError> {
    let group = {
        let library = state.library.lock().expect("library lock poisoned");
        library.group(&req.group_id).cloned().ok_or_else(|| {
            ipc_code(
                IpcErrorCode::NotFound,
                format!("命令组不存在: {}", req.group_id),
            )
        })?
    };
    if let Some(command) = group.first_command_needing_values() {
        return Err(ipc_library(LibraryError::GroupNeedsValues {
            group_id: group.id.clone(),
            command_id: command.id.clone(),
        }));
    }
    Ok(spawn(app, state, group, req.serials))
}

fn spawn(app: AppHandle, state: &AppState, group: CommandGroup, serials: Vec<String>) -> u32 {
    let run_id = state
        .group_next
        .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        + 1;
    let cancel = CancellationToken::new();
    state
        .group_runs
        .lock()
        .expect("group lock poisoned")
        .insert(run_id, cancel.clone());

    let task_id = state.tasks.register(
        format!("命令组: {}", group.name),
        format!("{} 台设备 · {} 条命令", serials.len(), group.commands.len()),
    );
    let (tx, mut rx) = mpsc::channel::<yohu_domain::GroupRunEvent>(64);
    let sink = state.event_tx.clone();
    let commands = group.commands.clone();

    tokio::spawn(async move {
        let forward = tokio::spawn(async move {
            while let Some(e) = rx.recv().await {
                let message = match &e.verdict {
                    Verdict::Pass => e.message,
                    Verdict::Fail { reason } => reason.clone(),
                };
                let _ = sink.try_send(AppEvent::GroupProgress(GroupProgress {
                    run_id,
                    serial: e.serial,
                    name: Some(e.name),
                    ok: e.verdict.is_pass(),
                    message: if message.is_empty() {
                        None
                    } else {
                        Some(message)
                    },
                    duration_ms: e.duration_ms,
                }));
            }
        });

        let executor = GroupExecutor::new({
            let state = app.state::<AppState>();
            state.client.clone()
        });
        executor.run(&commands, &serials, tx, cancel).await;
        let _ = forward.await;

        let state = app.state::<AppState>();
        state
            .group_runs
            .lock()
            .expect("group lock poisoned")
            .remove(&run_id);
        state.tasks.finish(task_id);
    });

    run_id
}

pub fn cancel(state: &AppState, run_id: u32) -> Result<(), IpcError> {
    let token = state
        .group_runs
        .lock()
        .expect("group lock poisoned")
        .get(&run_id)
        .cloned();
    match token {
        Some(c) => {
            c.cancel();
            Ok(())
        }
        None => Err(ipc_code(
            IpcErrorCode::NotFound,
            format!("运行不存在: {run_id}"),
        )),
    }
}
