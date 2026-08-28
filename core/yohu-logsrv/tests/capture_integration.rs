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

use yohu_adb::{AdbClient, ToolResolver};
use yohu_logsrv::CaptureService;
use yohu_protocol::AppEvent;

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
        "yohu-fake-{}-{:?}",
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
        std::env::temp_dir().join(format!("yohu-fake-data-{}", std::process::id())),
    )
}

fn build_service(adb_exe: PathBuf) -> (Arc<CaptureService>, mpsc::Receiver<AppEvent>) {
    let client = Arc::new(AdbClient::new(tool(adb_exe), 4));
    let (tx, rx) = mpsc::channel::<AppEvent>(64);
    let service = CaptureService::new(client, tx, 1000, tokio_util::sync::CancellationToken::new());
    (service, rx)
}

const THREE_LINES_SCRIPT: &str = r#"{
    "devices": ["R58M1234A device product:x model:Yohu_Phone transport_id:1"],
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

async fn collect_lines(
    rx: &mut mpsc::Receiver<AppEvent>,
    want: usize,
) -> Vec<yohu_protocol::LogLine> {
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
async fn start_while_live_adopts_same_generation() {
    let (service, _rx) = build_service(isolated_fake_adb(
        r#"{
            "logcat_lines": ["01-02 03:04:05.678  1  2 I T: tick"],
            "logcat_delay_ms": 20,
            "logcat_forever": true
        }"#,
    ));
    let first = service.start("R58M1234A", false).await.expect("首次开始");
    assert!(!first.adopted);
    assert!(service.is_capturing("R58M1234A"));

    let second = service
        .start("R58M1234A", false)
        .await
        .expect("二次开始应 adopt");
    assert!(second.adopted);
    assert_eq!(second.generation, first.generation);
    assert!(service.is_capturing("R58M1234A"));
    let status = service.status("R58M1234A");
    assert!(status.capturing);
    assert_eq!(status.generation, first.generation);

    service.stop("R58M1234A").await;
}

#[tokio::test]
async fn concurrent_start_during_starting_shares_one_generation() {
    let (service, _rx) = build_service(isolated_fake_adb(
        r#"{
            "logcat_lines": ["01-02 03:04:05.678  1  2 I T: tick"],
            "logcat_delay_ms": 20,
            "logcat_forever": true
        }"#,
    ));
    let a = Arc::clone(&service);
    let b = Arc::clone(&service);
    let (first, second) = tokio::join!(a.start("R58M1234A", false), b.start("R58M1234A", false));
    let first = first.expect("start a");
    let second = second.expect("start b");
    assert_eq!(first.generation, second.generation);
    assert_ne!(first.adopted, second.adopted, "恰好一路新流，另一路 adopt");
    assert!(service.is_capturing("R58M1234A"));
    service.stop("R58M1234A").await;
}

#[tokio::test]
async fn stop_during_start_releases_slot_and_allows_restart() {
    let (service, _rx) = build_service(isolated_fake_adb(
        r#"{
            "logcat_lines": ["01-02 03:04:05.678  1  2 I T: tick"],
            "logcat_delay_ms": 20,
            "logcat_forever": true
        }"#,
    ));
    let starter = Arc::clone(&service);
    let start = tokio::spawn(async move { starter.start("R58M1234A", false).await });
    let deadline = tokio::time::Instant::now() + Duration::from_secs(4);
    while !service.is_capturing("R58M1234A")
        && !start.is_finished()
        && tokio::time::Instant::now() < deadline
    {
        tokio::time::sleep(Duration::from_millis(2)).await;
    }
    service.stop("R58M1234A").await;
    let _ = start.await.expect("start join");
    assert!(!service.is_capturing("R58M1234A"));
    let status = service.status("R58M1234A");
    assert!(!status.capturing);
    assert!(
        status.generation > 0,
        "Empty 后仍报告已结束世代，供 UI 对账"
    );

    let again = service
        .start("R58M1234A", false)
        .await
        .expect("stop 后应能重新开始");
    assert!(!again.adopted);
    assert_ne!(again.generation, status.generation);
    service.stop("R58M1234A").await;
}

#[tokio::test]
async fn start_during_stop_waits_then_opens_new_generation() {
    let (service, mut rx) = build_service(isolated_fake_adb(
        r#"{
            "logcat_lines": ["01-02 03:04:05.678  1  2 I T: tick"],
            "logcat_delay_ms": 20,
            "logcat_forever": true
        }"#,
    ));
    let first = service.start("R58M1234A", false).await.expect("首次开始");
    wait_ring_lines(&service, "R58M1234A", 1).await;

    let service_stop = Arc::clone(&service);
    let stop = tokio::spawn(async move { service_stop.stop("R58M1234A").await });
    let deadline = tokio::time::Instant::now() + Duration::from_secs(4);
    while service.is_capturing("R58M1234A") && tokio::time::Instant::now() < deadline {
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    let second = service
        .start("R58M1234A", false)
        .await
        .expect("Stopping/Empty 后 start 应开新流");
    stop.await.expect("stop join");

    assert!(!second.adopted);
    assert_ne!(second.generation, first.generation);
    assert!(service.is_capturing("R58M1234A"));

    let mut saw_stop_then_run = false;
    let mut stopped = false;
    let deadline = tokio::time::Instant::now() + Duration::from_secs(4);
    while tokio::time::Instant::now() < deadline {
        match tokio::time::timeout(Duration::from_millis(200), rx.recv()).await {
            Ok(Some(AppEvent::CaptureState {
                generation, state, ..
            })) => {
                if state == yohu_protocol::CaptureState::Stopped && generation == first.generation {
                    stopped = true;
                }
                if stopped
                    && state == yohu_protocol::CaptureState::Running
                    && generation == second.generation
                {
                    saw_stop_then_run = true;
                    break;
                }
            }
            Ok(Some(_)) | Err(_) => {}
            Ok(None) => break,
        }
    }
    assert!(saw_stop_then_run, "新世代 Running 不得被旧 Stopped 盖过");

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
    assert!(
        !service.is_capturing("R58M1234A"),
        "流自然结束后槽位必须释放"
    );
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

    let mut saw_stopped = false;
    let deadline = tokio::time::Instant::now() + Duration::from_secs(12);
    while tokio::time::Instant::now() < deadline {
        if !service.is_capturing("R58M1234A") {
            while let Ok(event) = rx.try_recv() {
                if matches!(
                    event,
                    AppEvent::CaptureState {
                        state: yohu_protocol::CaptureState::Stopped,
                        ..
                    }
                ) {
                    saw_stopped = true;
                }
            }
            break;
        }
        match tokio::time::timeout(Duration::from_millis(100), rx.recv()).await {
            Ok(Some(AppEvent::CaptureState {
                state: yohu_protocol::CaptureState::Stopped,
                ..
            })) => {
                saw_stopped = true;
                break;
            }
            Ok(None) => break,
            Ok(Some(_)) | Err(_) => {}
        }
    }
    assert!(
        saw_stopped || !service.is_capturing("R58M1234A"),
        "掉线后应发出 Stopped 或释放槽位"
    );

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
    assert!(
        service.ring("R58M1234A").is_empty(),
        "切换/掉线清缓冲（防串设备）"
    );
}

#[tokio::test]
async fn process_snapshot_reads_ps() {
    let exe =
        isolated_fake_adb(r#"{ "ps": "PID NAME\n1234 com.yohu.app\n5678 com.yohu.app:core\n" }"#);
    let (service, _rx) = build_service(exe);
    let entries = service.process_snapshot("R58M1234A").await.expect("ps");
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].pid, 1234);
    assert_eq!(entries[0].name, "com.yohu.app");
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
        r#"{ "devices": ["R58M1234A device product:x model:Yohu_Phone transport_id:1", "Z9X unauthorized"] }"#,
    );
    let client = AdbClient::new(tool(exe), 4);
    let devices = client
        .devices(CancellationToken::new())
        .await
        .expect("扫描");
    assert_eq!(devices.len(), 2);
    assert_eq!(devices[0].model.as_deref(), Some("Yohu Phone"));
    assert_eq!(devices[0].state, yohu_protocol::DeviceState::Online);
    assert_eq!(devices[1].state, yohu_protocol::DeviceState::Unauthorized);
}
