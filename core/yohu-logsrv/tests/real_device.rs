//! 真实设备集成测试（第二层：yohu-logsrv 采集服务全链路）。
//!
//! 覆盖：真实 logcat 单流采集 → threadtime 解析 → 环形缓冲 → 批量事件；
//! 停止保留缓冲；清设备缓冲（logcat -c）后重采；设备切换清缓冲语义。
//! 无在线设备时自动跳过。

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::mpsc;

use yohu_adb::{AdbClient, ToolResolver};
use yohu_logsrv::{CaptureService, SessionLogService};
use yohu_protocol::{AppEvent, LogWriteMode};

fn real_adb() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tools/adb.exe")
}

/// 每个测试独立的临时目录（避免相对路径在 crate CWD 物化残留目录，M4）。
fn scratch(part: &str) -> PathBuf {
    std::env::temp_dir().join(format!("yohu-logsrv-test-{}-{}", std::process::id(), part))
}

async fn online_device(client: &AdbClient) -> Option<String> {
    let devices = client
        .devices(tokio_util::sync::CancellationToken::new())
        .await
        .ok()?;
    devices
        .into_iter()
        .find(|d| d.state == yohu_protocol::DeviceState::Online)
        .map(|d| d.serial)
}

async fn collect_events(
    rx: &mut mpsc::Receiver<AppEvent>,
    min_lines: usize,
    timeout: Duration,
) -> Vec<yohu_protocol::LogLine> {
    let mut lines = Vec::new();
    let deadline = tokio::time::Instant::now() + timeout;
    while lines.len() < min_lines && tokio::time::Instant::now() < deadline {
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
async fn real_capture_stream_batch_and_ring() {
    let client = Arc::new(AdbClient::new(
        ToolResolver::new(Some(real_adb()), scratch("res"), scratch("data")),
        4,
    ));
    let Some(serial) = online_device(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };

    let (tx, mut rx) = mpsc::channel::<AppEvent>(128);
    let service = CaptureService::new(
        client,
        tx,
        50_000,
        tokio_util::sync::CancellationToken::new(),
    );

    service.start(&serial, false).await.expect("开始采集");
    assert!(service.is_capturing(&serial));

    // 真实设备通常持续输出日志；等待批量事件（解析+聚合+推送全链路）
    let lines = collect_events(&mut rx, 5, Duration::from_secs(30)).await;
    assert!(!lines.is_empty(), "真实 logcat 应产出日志行");
    let ring = service.ring(&serial);
    assert!(ring.len() >= lines.len(), "环形缓冲应含全部批次行");
    let sample = &lines[0];
    eprintln!(
        "[真机] 采集 {} 行（缓冲 {}），样例: {} pid={} level={} tag={}",
        lines.len(),
        ring.len(),
        sample.ts,
        sample.pid,
        sample.level,
        sample.tag
    );
    // threadtime 解析质量：多数行应有时间戳与级别
    let parsed_ok = lines
        .iter()
        .filter(|l| !l.ts.is_empty() && l.level != '?')
        .count();
    assert!(
        parsed_ok * 10 >= lines.len() * 8,
        "解析质量不足: {parsed_ok}/{}",
        lines.len()
    );

    tokio::time::timeout(Duration::from_secs(15), service.stop(&serial))
        .await
        .expect("stop 应在杀进程树后返回");
    assert!(!service.is_capturing(&serial));
    assert!(!ring.is_empty(), "停止后缓冲保留");
}

#[tokio::test]
async fn real_capture_with_clear_device() {
    let client = Arc::new(AdbClient::new(
        ToolResolver::new(Some(real_adb()), scratch("res"), scratch("data")),
        4,
    ));
    let Some(serial) = online_device(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    let (tx, mut rx) = mpsc::channel::<AppEvent>(128);
    let service = CaptureService::new(
        client,
        tx,
        50_000,
        tokio_util::sync::CancellationToken::new(),
    );

    // 开采前 logcat -c：start(clear_device=true) 内部执行
    service
        .start(&serial, true)
        .await
        .expect("开始采集（先清设备缓冲）");
    let lines = collect_events(&mut rx, 3, Duration::from_secs(30)).await;
    assert!(!lines.is_empty(), "清缓冲后仍应采集到新日志");
    eprintln!("[真机] 清缓冲重采 {} 行", lines.len());

    tokio::time::timeout(Duration::from_secs(15), service.stop(&serial))
        .await
        .expect("stop 应在杀进程树后返回");
    service.clear(&serial);
    assert!(service.ring(&serial).is_empty(), "clear 后缓冲为空");
}

#[tokio::test]
async fn real_detach_clears_ring() {
    let client = Arc::new(AdbClient::new(
        ToolResolver::new(Some(real_adb()), scratch("res"), scratch("data")),
        4,
    ));
    let Some(serial) = online_device(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    let (tx, _rx) = mpsc::channel::<AppEvent>(128);
    let service = CaptureService::new(
        client,
        tx,
        50_000,
        tokio_util::sync::CancellationToken::new(),
    );

    service.start(&serial, false).await.expect("开始采集");
    tokio::time::sleep(Duration::from_secs(3)).await;
    tokio::time::timeout(Duration::from_secs(15), service.detach_device(&serial))
        .await
        .expect("detach 应在杀进程树后返回，不能握着 logcat 管道死等");
    assert!(!service.is_capturing(&serial));
    assert!(
        service.ring(&serial).is_empty(),
        "切换/掉线清缓冲（防串设备）"
    );
}

/// 日志写入端到端：采集 → 逐窗口实时文件 → 合并导出，内容与已采集行一致。
#[tokio::test]
async fn real_session_log_write_export() {
    let client = Arc::new(AdbClient::new(
        ToolResolver::new(
            Some(real_adb()),
            scratch("res2"),
            scratch("data2"),
        ),
        4,
    ));
    let Some(serial) = online_device(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    let (tx, mut rx) = mpsc::channel::<AppEvent>(128);
    let service = CaptureService::new(
        client,
        tx,
        50_000,
        tokio_util::sync::CancellationToken::new(),
    );

    service.start(&serial, false).await.expect("开始采集");
    let lines = collect_events(&mut rx, 5, Duration::from_secs(30)).await;
    tokio::time::timeout(Duration::from_secs(15), service.stop(&serial))
        .await
        .expect("stop 应在杀进程树后返回");
    assert!(!lines.is_empty(), "真实设备应产出至少一行");

    let root = std::env::temp_dir().join(format!(
        "yohu-real-slog-{}-{:?}",
        std::process::id(),
        std::thread::current().id()
    ));
    let slog = SessionLogService::new(root.clone());
    slog.open(&serial, 1, "System", LogWriteMode::Overwrite)
        .expect("打开窗口日志文件");
    // 窗口记录的是「UI 已过滤后的行」；真实设备场景直接写入采集到的行
    for chunk in lines.chunks(500) {
        slog.append(&serial, 1, chunk).expect("追加窗口日志");
    }
    slog.close(&serial, 1).expect("关闭窗口日志文件");

    let listed = slog.list().expect("列出窗口日志文件");
    assert_eq!(listed.len(), 1, "应恰好一个窗口日志文件");
    assert_eq!(listed[0].lines, lines.len() as u64);

    let srcs: Vec<String> = listed.iter().map(|f| f.path.clone()).collect();
    let result = slog.export(&srcs, None, None).expect("合并导出");
    let content = std::fs::read_to_string(&result.path).expect("读导出文件");
    assert_eq!(content.lines().count() as u64, result.lines);
    assert_eq!(result.lines, lines.len() as u64, "导出行数与采集行数一致");

    let _ = std::fs::remove_dir_all(&root);
}
