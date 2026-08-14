//! 事件分发：core 事件 → Tauri emit（事件名由 AppEvent::name() 决定）。

use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use yovo_protocol::AppEvent;

/// 启动分发循环（app 层唯一的事件出口）。
pub fn spawn_dispatcher(rx: mpsc::Receiver<AppEvent>, app: AppHandle) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut rx = rx;
        while let Some(event) = rx.recv().await {
            let name = event.name();
            let _ = app.emit(name, &event);
        }
    })
}
