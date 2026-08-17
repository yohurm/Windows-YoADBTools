//! 真实设备集成测试（第二层：yovo-logsrv 采集服务全链路）。
//!
//! 覆盖：真实 logcat 单流采集 → threadtime 解析 → 环形缓冲 → 批量事件；
//! 停止保留缓冲；清设备缓冲（logcat -c）后重采；设备切换清缓冲语义。
//! 无在线设备时自动跳过。

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::mpsc;

use yovo_adb::{AdbClient, ToolResolver};
use yovo_logsrv::CaptureService;
use yovo_protocol::AppEvent;

fn real_adb() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tools/adb.exe")
}

async fn online_device(client: &AdbClient) -> Option<String> {
    let devices = client.devices(tokio_util::sync::CancellationToken::new()).await.ok()?;
    devices
        .into_iter()
        .find(|d| d.state == yovo_protocol::DeviceState::Online)
        .map(|d| d.serial)
}

async fn collect_events(
    rx: &mut mpsc::Receiver<AppEvent>,
    min_lines: usize,
    timeout: Duration,
) -> Vec<yovo_protocol::LogLine> {
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
        ToolResolver::new(Some(real_adb()), PathBuf::from("n/a"), PathBuf::from("n/a")),
        4,
    ));
    let Some(serial) = online_device(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };

    let (tx, mut rx) = mpsc::channel::<AppEvent>(128);
    let service = CaptureService::new(client, tx, 50_000);

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
    let parsed_ok = lines.iter().filter(|l| !l.ts.is_empty() && l.level != '?').count();
    assert!(parsed_ok * 10 >= lines.len() * 8, "解析质量不足: {parsed_ok}/{}", lines.len());

    service.stop(&serial).await;
    assert!(!service.is_capturing(&serial));
    assert!(!ring.is_empty(), "停止后缓冲保留");
}

#[tokio::test]
async fn real_capture_with_clear_device() {
    let client = Arc::new(AdbClient::new(
        ToolResolver::new(Some(real_adb()), PathBuf::from("n/a"), PathBuf::from("n/a")),
        4,
    ));
    let Some(serial) = online_device(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    let (tx, mut rx) = mpsc::channel::<AppEvent>(128);
    let service = CaptureService::new(client, tx, 50_000);

    // 开采前 logcat -c：start(clear_device=true) 内部执行
    service.start(&serial, true).await.expect("开始采集（先清设备缓冲）");
    let lines = collect_events(&mut rx, 3, Duration::from_secs(30)).await;
    assert!(!lines.is_empty(), "清缓冲后仍应采集到新日志");
    eprintln!("[真机] 清缓冲重采 {} 行", lines.len());

    service.stop(&serial).await;
    service.clear(&serial);
    assert!(service.ring(&serial).is_empty(), "clear 后缓冲为空");
}

#[tokio::test]
async fn real_detach_clears_ring() {
    let client = Arc::new(AdbClient::new(
        ToolResolver::new(Some(real_adb()), PathBuf::from("n/a"), PathBuf::from("n/a")),
        4,
    ));
    let Some(serial) = online_device(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    let (tx, _rx) = mpsc::channel::<AppEvent>(128);
    let service = CaptureService::new(client, tx, 50_000);

    service.start(&serial, false).await.expect("开始采集");
    tokio::time::sleep(Duration::from_secs(3)).await;
    service.detach_device(&serial).await;
    assert!(!service.is_capturing(&serial));
    assert!(service.ring(&serial).is_empty(), "切换/掉线清缓冲（防串设备）");
}
