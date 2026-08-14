//! 事件分发：core 事件 → Tauri emit（事件名由 AppEvent::name() 决定）。

use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

use yovo_protocol::AppEvent;

/// 启动分发循环（app 层唯一的事件出口）。
///
/// 注意：必须用 `tauri::async_runtime::spawn` 而非 `tokio::spawn`——
/// 本函数在 Tauri setup（主线程，无 tokio reactor 上下文）调用。
pub fn spawn_dispatcher(
    rx: mpsc::Receiver<AppEvent>,
    app: AppHandle,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        let mut rx = rx;
        while let Some(event) = rx.recv().await {
            let name = event.name();
            let _ = app.emit(name, &event);
        }
    })
}
