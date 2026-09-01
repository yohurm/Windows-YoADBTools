//! 应用状态容器：core 服务实例 + 运行期可变状态。
//!
//! 组合根装配在 lib.rs；commands 层只经 State<AppState> 访问，不触碰 Tauri 之外的全局。

use std::collections::HashMap;
use std::sync::atomic::AtomicU32;
use std::sync::{Arc, Mutex};

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use yohu_adb::{AdbClient, ToolResolver};
use yohu_domain::{
    assert_device_online, assert_targets_online, AppLog, CommandLibrary, DeviceSessionError,
};
use yohu_files::{FileBrowser, FileMutator, TransferRunner};
use yohu_logsrv::{CaptureService, SessionLogService};
use yohu_mirror::MirrorService;
use yohu_protocol::{AppEvent, DeviceInfo, IpcError, IpcErrorCode};

use crate::paths::AppPaths;
use crate::settings_store::SettingsStore;
use crate::tasks::TaskCenter;

/// 应用状态（Tauri managed state）。
pub struct AppState {
    // ===== core 服务（只读装配，运行期不换） =====
    pub client: Arc<AdbClient>,
    pub tool: Arc<ToolResolver>,
    pub capture: Arc<CaptureService>,
    pub mirror: Arc<MirrorService>,
    pub browser: FileBrowser,
    pub mutator: FileMutator,
    pub transfers: TransferRunner,
    pub session_log: SessionLogService,
    pub settings: SettingsStore,
    pub paths: AppPaths,
    pub app_log: AppLog,
    pub tasks: Arc<TaskCenter>,

    // ===== 事件与生命周期 =====
    pub event_tx: mpsc::Sender<AppEvent>,
    pub root_cancel: CancellationToken,

    // ===== 运行期状态（短临界区，std Mutex） =====
    /// 最近一次设备扫描快照
    pub last_devices: Mutex<Vec<DeviceInfo>>,
    /// 最近一次扫描实际使用的 adb 路径（诊断）
    pub adb_in_use: Mutex<Option<String>>,
    /// 命令组运行（run_id → 取消令牌）
    pub group_runs: Mutex<HashMap<u32, CancellationToken>>,
    pub group_next: AtomicU32,
    /// 已加载命令库缓存
    pub library: Mutex<CommandLibrary>,
    /// 采集任务登记（serial → 任务 id）
    pub capture_tasks: Mutex<HashMap<String, u32>>,
    /// 投屏任务登记（serial → 任务 id）
    pub mirror_tasks: Mutex<HashMap<String, u32>>,
    /// 传输取消令牌（transfer id → token）；拖出 GetData 与对话框共用
    pub transfer_cancels: Arc<Mutex<HashMap<u32, CancellationToken>>>,
    pub transfer_next: Arc<AtomicU32>,
    /// 当前目录列举取消令牌（新 list 取消上一趟，防过期结果覆盖）
    pub browse_cancel: Mutex<CancellationToken>,
    /// 进行中的应用更新下载取消令牌
    pub update_download_cancel: Mutex<Option<CancellationToken>>,
}

impl AppState {
    /// 命令边界：serial 必须在最近扫描中且在线（与 SafetyRoot 同级，不信任 UI）。
    pub fn require_online(&self, serial: &str) -> Result<(), IpcError> {
        let devices = self.last_devices.lock().expect("devices lock poisoned");
        assert_device_online(serial, &devices).map_err(session_ipc)
    }

    /// 命令边界：一组执行目标全部在线。
    pub fn require_online_many(&self, serials: &[String]) -> Result<(), IpcError> {
        let devices = self.last_devices.lock().expect("devices lock poisoned");
        assert_targets_online(serials, &devices).map_err(session_ipc)
    }

    /// 采集任务随 CaptureState::Stopped 收敛；重复调用幂等。
    pub fn finish_capture_task(&self, serial: &str) {
        if let Some(task_id) = self
            .capture_tasks
            .lock()
            .expect("capture lock poisoned")
            .remove(serial)
        {
            self.tasks.finish(task_id);
        }
    }

    /// 投屏任务随 MirrorSessionState::Stopped/Failed 收敛；重复调用幂等。
    pub fn finish_mirror_task(&self, serial: &str) {
        if let Some(task_id) = self
            .mirror_tasks
            .lock()
            .expect("mirror task lock poisoned")
            .remove(serial)
        {
            self.tasks.finish(task_id);
        }
    }
}

fn session_ipc(e: DeviceSessionError) -> IpcError {
    let code = match e {
        DeviceSessionError::Empty => IpcErrorCode::InvalidArgs,
        DeviceSessionError::Unknown(_) => IpcErrorCode::NotFound,
        DeviceSessionError::Unauthorized(_) => IpcErrorCode::Unauthorized,
        DeviceSessionError::Offline(_) => IpcErrorCode::DeviceOffline,
    };
    IpcError {
        code,
        message: e.to_string(),
    }
}
