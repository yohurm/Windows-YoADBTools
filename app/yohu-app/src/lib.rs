//! yohu-app — Tauri 桌面壳（组合根）。
//!
//! 架构边界（ADR-v6-005）：
//! - 本 crate 是**唯一**引用 Tauri 的地方；
//! - `commands/` 是薄命令层：参数反序列化 → core API → 结果序列化，**禁止业务逻辑**；
//! - 所有业务能力在 core crates（domain/adb/logsrv/files/update）。

mod commands;
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
mod yolog;

use std::path::PathBuf;
use std::time::Duration;

use tauri::{Manager, RunEvent};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use yohu_adb::{AdbClient, ToolResolver};
use yohu_domain::AppLog;
use yohu_files::{FileBrowser, FileMutator, TransferRunner};
use yohu_logsrv::{CaptureService, SessionLogService};
use yohu_mirror::MirrorService;
use yohu_protocol::AppEvent;

use crate::paths::AppPaths;
use crate::settings_store::SettingsStore;
use crate::state::AppState;
use crate::tasks::TaskCenter;

pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    // WebView2 默认不挂无障碍树；UIA 联调与读屏都需要强制打开。
    // 必须在创建 WebView 之前设置（进程级环境变量）。
    if std::env::var_os("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_none() {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--force-renderer-accessibility",
        );
    }
    // 诊断日志：release（windows_subsystem）无控制台 → 落盘 logs/app.log（滚动 1MB×3）
    // 与设备日志严格分离（ADR-v6-010）；AppLog 内存环仍不落盘。
    let logs_dir = AppPaths::default_logs_dir();
    let file_appender = tracing_appender::rolling::Builder::new()
        .rotation(tracing_appender::rolling::Rotation::DAILY)
        .max_log_files(7)
        .filename_prefix("app")
        .filename_suffix("log")
        .build(&logs_dir)
        .expect("日志目录创建失败");
    let (nb_writer, _guard) = tracing_appender::non_blocking(file_appender);
    use tracing_subscriber::fmt::writer::MakeWriterExt;
    tracing_subscriber::fmt()
        .with_ansi(false)
        .with_target(true)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                "yohu_app_lib=info,yohu_adb=info,yohu_logsrv=info,yohu_files=info,yohu_mirror=info,yohu_update=info".into()
            }),
        )
        .with_writer(std::io::stdout.and(nb_writer))
        .init();

    let root_cancel = CancellationToken::new();

    let builder = tauri::Builder::default().setup(move |app| {
        let handle = app.handle().clone();

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
        let resource_dir = sidecar::resolve_resource_dir(app);
        let server_jar = resource_dir.join(yohu_protocol::dir::SCRCPY_SERVER);

        // 4) core 服务装配
        let user_adb = (!snapshot.adb_path.is_empty()).then(|| PathBuf::from(&snapshot.adb_path));
        let tool = std::sync::Arc::new(ToolResolver::new(
            user_adb,
            resource_dir,
            paths.adb_tools_dir(),
        ));
        let client = std::sync::Arc::new(AdbClient::new((*tool).clone(), 8));

        let (event_tx, event_rx) = mpsc::channel::<AppEvent>(8192);
        events::spawn_dispatcher(event_rx, handle.clone());

        let capture =
            CaptureService::new(client.clone(), event_tx.clone(), snapshot.buffer_capacity);
        let mirror = MirrorService::new(client.clone(), event_tx.clone(), server_jar);

        let state = AppState {
            client: client.clone(),
            tool,
            capture,
            mirror,
            browser: FileBrowser::new(client.clone()),
            mutator: FileMutator::new(client.clone()),
            transfers: TransferRunner::new(client.clone()),
            session_log: SessionLogService::new(paths.session_logs_dir()),
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
            mirror_tasks: std::sync::Mutex::new(std::collections::HashMap::new()),
            transfer_cancels: std::sync::Arc::new(std::sync::Mutex::new(
                std::collections::HashMap::new(),
            )),
            transfer_next: std::sync::Arc::new(std::sync::atomic::AtomicU32::new(0)),
            browse_cancel: std::sync::Mutex::new(CancellationToken::new()),
        };
        app.manage(state);

        let exit_handle = handle.clone();
        let exit_cancel = root_cancel.clone();
        tauri::async_runtime::spawn(async move {
            exit_cancel.cancelled().await;
            let state = exit_handle.state::<AppState>();
            state.mirror.stop_all().await;
        });

        // 5) 启动预热（异步，不阻塞窗口）：adb 解压 + 首扫设备
        let warm_handle = handle.clone();
        tauri::async_runtime::spawn(async move {
            let state = warm_handle.state::<AppState>();
            state.tool.warm_up().await;
            if let Err(e) = crate::device_catalog::refresh(&state).await {
                tracing::warn!("启动设备扫描失败: {e}");
            } else {
                tracing::info!("启动预热完成");
            }
        });

        // 6) 可选设备自动刷新（settings 冻结快照决定）
        if snapshot.devices_auto_refresh > 0 {
            let handle = handle.clone();
            let interval_secs = snapshot.devices_auto_refresh as u64;
            tauri::async_runtime::spawn(async move {
                let mut ticker = tokio::time::interval(Duration::from_secs(interval_secs));
                loop {
                    ticker.tick().await;
                    let state = handle.state::<AppState>();
                    if let Err(e) = crate::device_catalog::refresh(&state).await {
                        tracing::warn!("自动刷新失败: {e}");
                    }
                }
            });
        }

        tracing::info!("壳 setup 完成，窗口即将显示");
        Ok(())
    });

    let app = builder
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::device::device_refresh,
            commands::adb::adb_exec,
            commands::terminal::terminal_eval,
            commands::terminal::group_run,
            commands::terminal::group_cancel,
            commands::commandlib::commandlib_load,
            commands::commandlib::commandlib_save,
            commands::files::files_list,
            commands::files::files_push,
            commands::files::files_pull,
            commands::files::files_cancel,
            commands::files::files_delete,
            commands::files::files_mkdir,
            commands::files::files_create,
            commands::files::files_drag_out,
            commands::log::log_capture_start,
            commands::log::log_capture_stop,
            commands::log::log_capture_status,
            commands::log::log_clear,
            commands::log::log_clear_device,
            commands::log::log_replay,
            commands::log::log_export,
            commands::log::log_session_file_open,
            commands::log::log_session_file_append,
            commands::log::log_session_file_close,
            commands::log::log_session_file_latest,
            commands::log::log_session_file_list,
            commands::log::log_process_snapshot,
            commands::mirror::mirror_start,
            commands::mirror::mirror_stop,
            commands::mirror::mirror_status,
            commands::mirror::mirror_inject,
            commands::mirror::mirror_close_control,
            commands::mirror::mirror_save_png,
            commands::settings::settings_get,
            commands::settings::settings_set,
            commands::system::system_info,
            commands::system::system_open_path,
            commands::system::system_report_error,
            commands::system::system_log,
            commands::update::update_check,
            commands::update::update_info,
            commands::update::update_open,
        ])
        .build(tauri::generate_context!())?;

    // 退出序列：根 cancel → 采集/传输收敛 → 设置 flush
    app.run(move |app, event| {
        if let RunEvent::Exit = event {
            if let Some(state) = app.try_state::<AppState>() {
                state.root_cancel.cancel();
                if let Err(e) = state.settings.save_atomic() {
                    tracing::warn!("退出时保存设置失败: {e}");
                }
                crate::dnd::cleanup_stale(&state.paths.drag_out_dir());
            }
        }
    });

    Ok(())
}
