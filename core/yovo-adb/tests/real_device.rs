//! 真实设备集成测试（自底而上调试第一层：yovo-adb + 命令组编排端到端）。
//!
//! 无在线设备时自动跳过；有设备时对真实 adb.exe 执行扫描/命令/ls/ps/流式全链路。
//! 运行方式：`cargo test -p yovo-adb --test real_device -- --nocapture`

use std::path::PathBuf;
use std::time::Duration;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use yovo_adb::{AdbClient, ToolResolver};
use yovo_domain::{default_library, GroupExecutor, Verdict};

fn real_adb() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../tools/adb.exe")
}

/// 探测在线设备；无设备返回 None（测试自动跳过）。
async fn online_device(client: &AdbClient) -> Option<String> {
    let devices = client.devices(CancellationToken::new()).await.ok()?;
    devices
        .into_iter()
        .find(|d| d.state == yovo_protocol::DeviceState::Online)
        .map(|d| d.serial)
}

fn client() -> AdbClient {
    AdbClient::new(
        ToolResolver::new(
            Some(real_adb()),
            PathBuf::from("nonexistent-resource"),
            PathBuf::from("nonexistent-data"),
        ),
        4,
    )
}

#[tokio::test]
async fn real_device_scan_and_model() {
    let client = client();
    let Some(serial) = online_device(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    let devices = client.devices(CancellationToken::new()).await.expect("扫描失败");
    let me = devices.iter().find(|d| d.serial == serial).expect("设备在列表中");
    eprintln!("[真机] serial={serial} model={:?} connection={}", me.model, me.connection);
    assert!(me.model.is_some(), "devices -l 应解析出型号");
}

#[tokio::test]
async fn real_device_getprop_roundtrip() {
    let client = client();
    let Some(serial) = online_device(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    let out = client
        .run(&serial, &["shell".into(), "getprop".into(), "ro.product.model".into()], Some(15_000), CancellationToken::new())
        .await
        .expect("getprop 失败");
    assert_eq!(out.exit_code, 0, "stderr={}", out.stderr);
    assert!(!out.stdout.trim().is_empty(), "型号不应为空");
    eprintln!("[真机] ro.product.model = {}", out.stdout.trim());
}

#[tokio::test]
async fn real_device_ls_parse() {
    let client = client();
    let Some(serial) = online_device(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    // /storage/emulated/0 为真实内容目录（/sdcard 在部分机型是符号链接，裸 ls 只列链接本身）
    let entries = client.ls(&serial, "/storage/emulated/0/", CancellationToken::new()).await.expect("ls 失败");
    assert!(entries.len() >= 3, "真实存储应有多条目，实际 {}", entries.len());
    eprintln!("[真机] /storage/emulated/0 条目数 = {}，前 5:", entries.len());
    for e in entries.iter().take(5) {
        eprintln!("  [{:?}] {} ({})", e.kind, e.name, e.permission);
    }
    assert!(entries.iter().any(|e| e.kind == yovo_protocol::EntryKind::Dir), "应含目录条目");
}

#[tokio::test]
async fn real_device_ps_parse() {
    let client = client();
    let Some(serial) = online_device(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    let entries = client.ps(&serial, CancellationToken::new()).await.expect("ps 失败");
    assert!(!entries.is_empty(), "ps 应有进程");
    assert!(entries.iter().any(|e| e.pid == 1), "应有 pid=1(init)");
    eprintln!("[真机] 进程数 = {}，含 init={}", entries.len(), entries.iter().any(|e| e.name == "init"));
}

#[tokio::test]
async fn real_device_stream_lines() {
    let client = client();
    let Some(serial) = online_device(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    // logcat 长驻流：读 3 行后取消（验证真实流式 + 取消终止进程树）
    let (tx, mut rx) = mpsc::channel::<String>(64);
    let cancel = CancellationToken::new();
    let cancel_for_stream = cancel.clone();
    let stream = tokio::spawn({
        let serial = serial.clone();
        async move {
            client
                .stream_lines(
                    &serial,
                    &["logcat".into(), "-v".into(), "threadtime".into()],
                    cancel_for_stream,
                    tx,
                )
                .await
        }
    });

    let mut got = 0;
    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    while got < 3 && tokio::time::Instant::now() < deadline {
        match tokio::time::timeout(Duration::from_secs(3), rx.recv()).await {
            Ok(Some(line)) => {
                eprintln!("[真机] logcat 行: {}", line.trim());
                got += 1;
            }
            Ok(None) => break,
            Err(_) => {}
        }
    }
    assert!(got >= 1, "应读到至少 1 行真实 logcat");
    cancel.cancel();
    // 取消后流须在 10s 内终止（终止进程树）；退出形态（Cancelled/自然退出）不限
    let joined = tokio::time::timeout(Duration::from_secs(10), stream).await;
    assert!(joined.is_ok(), "流未按时终止");
    eprintln!("[真机] 取消后流已终止");
}

/// 命令组编排端到端：默认库「设备信息」组在真机上执行，
/// 逐命令进度事件回流、判定全部通过（失败正则→成功正则→退出码）。
#[tokio::test]
async fn real_device_group_run_end_to_end() {
    let client = std::sync::Arc::new(client());
    let Some(serial) = online_device(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    let library = default_library();
    let group = library.group("g-device").expect("默认库含 g-device 组");
    assert_eq!(group.commands.len(), 3);

    let executor = GroupExecutor::new(client);
    let (tx, mut rx) = mpsc::channel::<yovo_domain::GroupRunEvent>(16);
    executor
        .run(&group.commands, std::slice::from_ref(&serial), tx, CancellationToken::new())
        .await;

    let mut events = Vec::new();
    while let Ok(e) = rx.try_recv() {
        events.push(e);
    }
    assert_eq!(events.len(), 3, "组内 3 条命令应各产生一条进度事件");
    for e in &events {
        eprintln!(
            "[真机] 组命令 {}: verdict={:?} msg={:.60}",
            e.name,
            e.verdict,
            e.message
        );
        assert_eq!(e.serial, serial);
    }
    assert!(
        events.iter().all(|e| e.verdict.is_pass()),
        "设备信息组在真机上应全部通过"
    );
    assert!(events.iter().any(|e| matches!(e.verdict, Verdict::Pass)), "至少一条 Pass");
}
