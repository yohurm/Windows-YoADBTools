//! 采集服务集成测试（fake-adb fixture）：
//! 单流采集 → 解析 → 环形缓冲 → 批量事件；停止保留缓冲；掉线/取消/切换语义。
//!
//! 并行安全：每个测试把 fake-adb.exe 拷贝进独立临时目录，
//! 脚本写在同目录 `fake-adb.json`（零共享环境变量）。

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use yovo_adb::{AdbClient, ToolResolver};
use yovo_logsrv::CaptureService;
use yovo_protocol::AppEvent;

/// 定位 fake-adb.exe：workspace member 的明文 bin 位于
/// `target/<profile>/fake-adb.exe`（`cargo build --workspace` 产出）。
fn fake_adb_src() -> PathBuf {
    let mut profile = std::env::current_exe().expect("测试进程路径");
    profile.pop(); // deps/
    profile.pop(); // debug/ | release/
    let exe = profile.join("fake-adb.exe");
    assert!(
        exe.is_file(),
        "找不到 {} — 请先执行 cargo build --workspace（集成测试依赖明文 bin）",
        exe.display()
    );
    exe
}

/// 为每个测试建立隔离的 fake adb（exe 副本 + 同名 json 脚本）。
fn isolated_fake_adb(script: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "yovo-fake-{}-{:?}",
        std::process::id(),
        std::thread::current().id()
    ));
    std::fs::create_dir_all(&dir).expect("创建临时目录失败");
    let exe = dir.join("fake-adb.exe");
    std::fs::copy(fake_adb_src(), &exe).expect("拷贝 fake-adb 失败");
    std::fs::write(exe.with_extension("json"), script).expect("写脚本失败");
    exe
}

fn tool(adb_exe: PathBuf) -> ToolResolver {
    ToolResolver::new(
        Some(adb_exe),
        PathBuf::from("nonexistent-resource"),
        PathBuf::from("nonexistent-data"),
    )
}

fn build_service(adb_exe: PathBuf) -> (Arc<CaptureService>, mpsc::Receiver<AppEvent>) {
    let client = Arc::new(AdbClient::new(tool(adb_exe), 4));
    let (tx, rx) = mpsc::channel::<AppEvent>(64);
    let service = CaptureService::new(client, tx, 1000);
    (service, rx)
}

const THREE_LINES_SCRIPT: &str = r#"{
    "devices": ["R58M1234A device product:x model:Yovo_Phone transport_id:1"],
    "logcat_lines": [
        "01-02 03:04:05.678  1234  5678 I TestTag: hello one",
        "01-02 03:04:05.779  1234  5678 W TestTag: hello two",
        "01-02 03:04:05.880  9999  5678 E OtherTag: hello three"
    ],
    "logcat_delay_ms": 5
}"#;

async fn wait_ring_lines(service: &Arc<CaptureService>, serial: &str, want: usize) {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(8);
    while service.ring(serial).len() < want && tokio::time::Instant::now() < deadline {
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

async fn collect_lines(rx: &mut mpsc::Receiver<AppEvent>, want: usize) -> Vec<yovo_protocol::LogLine> {
    let mut lines = Vec::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(8);
    while lines.len() < want && tokio::time::Instant::now() < deadline {
        match tokio::time::timeout(Duration::from_millis(500), rx.recv()).await {
            Ok(Some(AppEvent::LogBatch(payload))) => lines.extend(payload.batch.lines),
            Ok(Some(_)) => {}
            Ok(None) => break,
            Err(_) => {}
        }
    }
    lines
}

#[tokio::test]
async fn capture_streams_parses_and_batches() {
    let (service, mut rx) = build_service(isolated_fake_adb(THREE_LINES_SCRIPT));

    service.start("R58M1234A", false).await.expect("开始采集");
    assert!(service.is_capturing("R58M1234A"));

    let lines = collect_lines(&mut rx, 3).await;
    assert_eq!(lines.len(), 3, "应收到 3 行批量事件");
    assert_eq!(lines[0].seq, 0);
    assert_eq!(lines[0].pid, 1234);
    assert_eq!(lines[0].level, 'I');
    assert_eq!(lines[0].tag, "TestTag");
    assert_eq!(lines[1].level, 'W');
    assert_eq!(lines[2].pid, 9999);

    // 流自然结束 → 环形缓冲保留全部行
    let ring = service.ring("R58M1234A");
    assert_eq!(ring.len(), 3);
    assert_eq!(ring.last_seq(), 2);

    service.stop("R58M1234A").await;
}

#[tokio::test]
async fn stop_keeps_ring_and_clear_empties() {
    let (service, _rx) = build_service(isolated_fake_adb(THREE_LINES_SCRIPT));

    service.start("R58M1234A", false).await.expect("开始采集");
    wait_ring_lines(&service, "R58M1234A", 1).await;
    service.stop("R58M1234A").await;
    assert!(!service.is_capturing("R58M1234A"));

    let ring = service.ring("R58M1234A");
    assert!(!ring.is_empty(), "停止后缓冲保留（可继续过滤重放）");

    service.clear("R58M1234A");
    assert!(ring.is_empty());
}

#[tokio::test]
async fn start_rejects_while_live() {
    let (service, _rx) = build_service(isolated_fake_adb(THREE_LINES_SCRIPT));
    service.start("R58M1234A", false).await.expect("首次开始");
    let err = service.start("R58M1234A", false).await;
    assert!(err.is_err(), "同设备重复开始应被拒绝");
    service.stop("R58M1234A").await;
}

#[tokio::test]
async fn start_after_follow_ends_opens_new_stream() {
    let (service, _rx) = build_service(isolated_fake_adb(THREE_LINES_SCRIPT));
    service.start("R58M1234A", false).await.expect("首次开始");
    wait_ring_lines(&service, "R58M1234A", 3).await;
    let deadline = tokio::time::Instant::now() + Duration::from_secs(8);
    while service.is_capturing("R58M1234A") && tokio::time::Instant::now() < deadline {
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert!(!service.is_capturing("R58M1234A"), "流自然结束后槽位必须释放");
    service
        .start("R58M1234A", false)
        .await
        .expect("流结束后应能再次开始");
    assert!(service.is_capturing("R58M1234A"));
    service.stop("R58M1234A").await;
}

#[tokio::test]
async fn device_offline_stream_ends_with_state_stopped() {
    // 假 adb 输出一行后以掉线特征退出
    let exe = isolated_fake_adb(
        r#"{
            "logcat_lines": ["01-02 03:04:05.678  1  2 I T: bye"],
            "logcat_delay_ms": 5,
            "logcat_exit_code": 1,
            "logcat_stderr": "adb: device offline"
        }"#,
    );
    let (service, mut rx) = build_service(exe);

    service.start("R58M1234A", false).await.expect("开始采集");

    // 等待 Stopped 状态事件（流因掉线终止）
    let mut saw_stopped = false;
    let deadline = tokio::time::Instant::now() + Duration::from_secs(8);
    while !saw_stopped && tokio::time::Instant::now() < deadline {
        if let Ok(Some(AppEvent::CaptureState { state, .. })) =
            tokio::time::timeout(Duration::from_millis(500), rx.recv()).await
        {
            saw_stopped = state == yovo_protocol::CaptureState::Stopped;
        }
    }
    assert!(saw_stopped, "掉线后应发出 Stopped 状态");

    // 缓冲保留（掉线由 app 层决定是否清空）
    assert!(!service.ring("R58M1234A").is_empty());
    service.stop("R58M1234A").await;
}

#[tokio::test]
async fn cancel_stops_long_running_stream() {
    // 长驻流（forever）：取消令牌终止进程树
    let exe = isolated_fake_adb(
        r#"{
            "logcat_lines": ["01-02 03:04:05.678  1  2 I T: tick"],
            "logcat_delay_ms": 20,
            "logcat_forever": true
        }"#,
    );
    let (service, _rx) = build_service(exe);

    service.start("R58M1234A", false).await.expect("开始采集");
    wait_ring_lines(&service, "R58M1234A", 1).await;
    assert!(service.is_capturing("R58M1234A"));

    service.stop("R58M1234A").await;
    assert!(!service.is_capturing("R58M1234A"), "取消后采集应停止");
    assert!(!service.ring("R58M1234A").is_empty());
}

#[tokio::test]
async fn detach_device_stops_and_clears() {
    let (service, _rx) = build_service(isolated_fake_adb(THREE_LINES_SCRIPT));
    service.start("R58M1234A", false).await.expect("开始采集");
    wait_ring_lines(&service, "R58M1234A", 1).await;

    service.detach_device("R58M1234A").await;
    assert!(!service.is_capturing("R58M1234A"));
    assert!(service.ring("R58M1234A").is_empty(), "切换/掉线清缓冲（防串设备）");
}

#[tokio::test]
async fn process_snapshot_reads_ps() {
    let exe = isolated_fake_adb(
        r#"{ "ps": "PID NAME\n1234 com.yovo.app\n5678 com.yovo.app:core\n" }"#,
    );
    let (service, _rx) = build_service(exe);
    let entries = service.process_snapshot("R58M1234A").await.expect("ps");
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].pid, 1234);
    assert_eq!(entries[0].name, "com.yovo.app");
}

#[tokio::test]
async fn dump_into_ring_ingests_logcat_d() {
    let (service, _rx) = build_service(isolated_fake_adb(
        r#"{
            "logcat_lines": [
                "--------- beginning of main",
                "01-02 03:04:05.678  1234  5678 I TestTag: dumped"
            ],
            "logcat_delay_ms": 0
        }"#,
    ));
    let added = service.dump_into_ring("R58M1234A").await.expect("dump");
    assert_eq!(added, 1);
    let snap = service.ring("R58M1234A").snapshot(0, 10);
    assert_eq!(snap[0].msg, "dumped");
}

#[tokio::test]
async fn adb_client_devices_parse_via_fake() {
    let exe = isolated_fake_adb(
        r#"{ "devices": ["R58M1234A device product:x model:Yovo_Phone transport_id:1", "Z9X unauthorized"] }"#,
    );
    let client = AdbClient::new(tool(exe), 4);
    let devices = client.devices(CancellationToken::new()).await.expect("扫描");
    assert_eq!(devices.len(), 2);
    assert_eq!(devices[0].model.as_deref(), Some("Yovo Phone"));
    assert_eq!(devices[0].state, yovo_protocol::DeviceState::Online);
    assert_eq!(devices[1].state, yovo_protocol::DeviceState::Unauthorized);
}
