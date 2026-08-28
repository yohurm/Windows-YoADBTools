//! 后台任务中心：长任务（采集/传输/命令组）登记，状态栏展示。

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use tokio::sync::mpsc;

use yohu_protocol::{AppEvent, TaskInfo};

/// 任务登记中心。
pub struct TaskCenter {
    inner: Mutex<HashMap<u32, TaskInfo>>,
    next: AtomicU32,
    sink: mpsc::Sender<AppEvent>,
}

impl TaskCenter {
    pub fn new(sink: mpsc::Sender<AppEvent>) -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
            next: AtomicU32::new(1),
            sink,
        }
    }

    /// 登记一个活动任务（name 展示名，detail 悬停明细），返回任务 id。
    pub fn register(&self, name: String, detail: String) -> u32 {
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        self.inner.lock().expect("tasks lock poisoned").insert(
            id,
            TaskInfo {
                id,
                name,
                active: true,
                detail: Some(detail),
            },
        );
        self.emit();
        id
    }

    /// 完成任务（保留在列表中，状态栏短暂展示后由 UI 清理展示逻辑决定）。
    pub fn finish(&self, id: u32) {
        if let Some(task) = self.inner.lock().expect("tasks lock poisoned").get_mut(&id) {
            task.active = false;
        }
        self.emit();
    }

    pub fn summary(&self) -> Vec<TaskInfo> {
        let mut tasks: Vec<TaskInfo> = self
            .inner
            .lock()
            .expect("tasks lock poisoned")
            .values()
            .cloned()
            .collect();
        tasks.sort_by_key(|t| t.id);
        tasks
    }

    fn emit(&self) {
        let _ = self.sink.try_send(AppEvent::TaskSummary {
            tasks: self.summary(),
        });
    }
}
