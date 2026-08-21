//! 事件分发：core 事件 → UI 订阅通道。
//!
//! 事件名由 [`AppEvent::name()`] 决定，负载为 [`AppEvent`]（serde 内部 tag `kind`，camelCase）。
//! 当前阶段无 UI，分发器只做状态收敛；未来 rust-slint 接入后在此挂 UI 侧订阅回调。

use std::sync::Arc;

use tokio::sync::mpsc;

use crate::state::AppState;
use yohu_protocol::{AppEvent, CaptureState};

/// 启动分发循环（app 层唯一的事件出口）。
pub fn spawn_dispatcher(
    rx: mpsc::Receiver<AppEvent>,
    state: Arc<AppState>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut rx = rx;
        while let Some(event) = rx.recv().await {
            if let AppEvent::CaptureState {
                serial,
                state: CaptureState::Stopped,
                ..
            } = &event
            {
                state.finish_capture_task(serial);
            }
            // TODO(slint): 将事件推送给 UI（如 `AppEvent` 的 UI 侧广播）。
        }
    })
}
