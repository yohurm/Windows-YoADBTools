//! yohu-app — Rust 桌面壳（组合根）。
//!
//! 架构边界（ADR-slint-005）：
//! - 本 crate 是**唯一**的壳层，负责服务装配与生命周期；
//! - 所有业务能力在 core crates（domain/adb/logsrv/files/update）。
//!
//! 当前为纯 Rust 壳（UI 待 rust-slint 接入）；
//! 事件出口为 `mpsc` 通道，供未来 UI 订阅。

pub mod commands;
mod device_catalog;
mod dnd;
mod events;
mod group_runs;
mod library_store;
mod panic_hook;
mod paths;
mod settings_store;
mod sidecar;
mod state;
mod tasks;

use std::path::PathBuf;
use std::time::Duration;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use yohu_adb::{AdbClient, ToolResolver};
use yohu_domain::AppLog;
use yohu_files::{FileBrowser, FileMutator, TransferRunner};
use yohu_logsrv::{CaptureService, ExportService};
use yohu_protocol::AppEvent;

use crate::paths::AppPaths;
use crate::settings_store::SettingsStore;
use crate::state::AppState;
use crate::tasks::TaskCenter;

/// 应用入口：纯 Rust 装配 + 阻塞直到取消。
pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    // 诊断日志：release（windows_subsystem）无控制台 → 落盘 logs/app.log（滚动 1MB×3）
    // 与设备日志严格分离（ADR-slint-010）；AppLog 内存环仍不落盘。
    let logs_dir = AppPaths::default_logs_dir();
    let file_appender = tracing_appender::rolling::Builder::new()
        .rotation(tracing_appender::rolling::Rotation::DAILY)
        .max_log_files(7)
        .filename_prefix("app")
        .filename_suffix("log")
        .build(&logs_dir)
        .expect("日志目录创建失败");
    let (writer, _guard) = tracing_appender::non_blocking(file_appender);
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                "yohu_app=info,yohu_adb=info,yohu_logsrv=info,yohu_update=info".into()
            }),
        )
        .with_writer(writer)
        .init();

    let root_cancel = CancellationToken::new();
    let runtime = tokio::runtime::Runtime::new()?;
    runtime.block_on(run_async(root_cancel.clone()));
    Ok(())
}

/// 异步装配：core 服务 + 后台任务，直到根取消。
async fn run_async(root_cancel: CancellationToken) {
    // 1) 设置（先探针读取，确定 data_root 冻结快照；设置根不随数据目录迁移）
    let probe_file = AppPaths::probe_settings_file();
    let settings = SettingsStore::load(probe_file);
    let snapshot = settings.snapshot();
    let paths = AppPaths::resolve(&snapshot.data_root);
    crate::dnd::cleanup_stale(&paths.drag_out_dir());

    // 2) 崩溃 hook（先于一切业务）
    panic_hook::install(paths.logs_dir.clone());
    tracing::info!("数据根: {}", paths.data_root.display());

    // 3) sidecar 资源目录：应用旁 tools/（开发与 NSIS 默认）/ resources / 仓库 tools/
    let resource_dir = sidecar::resolve_resource_dir();

    // 4) core 服务装配
    let user_adb = (!snapshot.adb_path.is_empty()).then(|| PathBuf::from(&snapshot.adb_path));
    let tool = std::sync::Arc::new(ToolResolver::new(
        user_adb,
        resource_dir,
        paths.adb_tools_dir(),
    ));
    let client = std::sync::Arc::new(AdbClient::new((*tool).clone(), 8));

    let (event_tx, event_rx) = mpsc::channel::<AppEvent>(1024);
    let capture =
        CaptureService::new(client.clone(), event_tx.clone(), snapshot.buffer_capacity);

    let state = std::sync::Arc::new(AppState {
        client: client.clone(),
        tool,
        capture,
        browser: FileBrowser::new(client.clone()),
        mutator: FileMutator::new(client.clone()),
        transfers: TransferRunner::new(client.clone()),
        export: ExportService::new(paths.exports_dir()),
        settings,
        paths: paths.clone(),
        app_log: AppLog::new(500),
        tasks: std::sync::Arc::new(TaskCenter::new(event_tx.clone())),
        event_tx: event_tx.clone(),
        root_cancel: root_cancel.clone(),
        last_devices: std::sync::Mutex::new(Vec::new()),
        adb_in_use: std::sync::Mutex::new(None),
        group_runs: std::sync::Mutex::new(std::collections::HashMap::new()),
        group_next: std::sync::atomic::AtomicU32::new(0),
        library: std::sync::Mutex::new(yohu_domain::CommandLibrary::empty()),
        capture_tasks: std::sync::Mutex::new(std::collections::HashMap::new()),
        transfer_cancels: std::sync::Arc::new(std::sync::Mutex::new(
            std::collections::HashMap::new(),
        )),
        transfer_next: std::sync::Arc::new(std::sync::atomic::AtomicU32::new(0)),
        browse_cancel: std::sync::Mutex::new(CancellationToken::new()),
    });

    // 事件分发（未来 UI 订阅；当前只收敛采集任务）
    events::spawn_dispatcher(event_rx, state.clone());

    // 5) 启动预热（异步，不阻塞）：adb 解压 + 首扫设备
    {
        let state = state.clone();
        tokio::spawn(async move {
            state.tool.warm_up().await;
            if let Err(e) = crate::device_catalog::refresh(&state).await {
                tracing::warn!("启动设备扫描失败: {e}");
            }
        });
    }

    // 6) 可选设备自动刷新（settings 冻结快照决定）
    if snapshot.devices_auto_refresh > 0 {
        let state = state.clone();
        let interval_secs = snapshot.devices_auto_refresh as u64;
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(Duration::from_secs(interval_secs));
            loop {
                ticker.tick().await;
                if let Err(e) = crate::device_catalog::refresh(&state).await {
                    tracing::warn!("自动刷新失败: {e}");
                }
            }
        });
    }

    // 7) 阻塞等待取消（UI 接入后由窗口事件循环驱动）。
    tokio::select! {
        _ = root_cancel.cancelled() => {}
    }

    // 退出序列：根 cancel → 采集/传输收敛 → 设置 flush
    state.root_cancel.cancel();
    if let Err(e) = state.settings.save_atomic() {
        tracing::warn!("退出时保存设置失败: {e}");
    }
    crate::dnd::cleanup_stale(&state.paths.drag_out_dir());
}
