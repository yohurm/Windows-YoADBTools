//! 真实设备集成测试（第三层：yovo-files 浏览/传输/变更 + SafetyRoot）。
//!
//! 覆盖：真实 /sdcard 浏览解析；push/pull 内容一致；mkdir + 删除；
//! SafetyRoot 拒绝危险路径。无在线设备时自动跳过。

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use yovo_adb::{AdbClient, ToolResolver};
use yovo_files::{FileBrowser, FileMutator, TransferRunner, TransferSpec};
use yovo_protocol::{AppEvent, Direction};

fn real_adb() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tools/adb.exe")
}

async fn online_device(client: &AdbClient) -> Option<String> {
    let devices = client.devices(CancellationToken::new()).await.ok()?;
    devices
        .into_iter()
        .find(|d| d.state == yovo_protocol::DeviceState::Online)
        .map(|d| d.serial)
}

#[tokio::test]
async fn real_browse_and_transfer_roundtrip() {
    let client = Arc::new(AdbClient::new(
        ToolResolver::new(Some(real_adb()), PathBuf::from("n/a"), PathBuf::from("n/a")),
        4,
    ));
    let Some(serial) = online_device(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };

    // 1) 浏览 /sdcard
    let browser = FileBrowser::new(client.clone());
    let entries = browser.list(&serial, "/sdcard", CancellationToken::new()).await.expect("浏览失败");
    assert!(!entries.is_empty());
    assert!(
        entries.iter().any(|e| e.mtime.is_some()),
        "ls -la 解析应携带修改时间列（文件列表展示依据）"
    );
    eprintln!("[真机] /sdcard 条目 {} 个（含 mtime 解析）", entries.len());

    // 2) push 一个测试文件
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let local = std::env::temp_dir().join(format!("yovo-real-push-{stamp}.txt"));
    let content = format!("yovo-v6 real device test {stamp}\n");
    std::fs::write(&local, &content).expect("写本地文件");
    let remote = format!("/sdcard/yovo-real-test-{stamp}.txt");

    let runner = TransferRunner::new(client.clone());
    let (tx, _rx) = mpsc::channel::<AppEvent>(16);
    let pushed = runner
        .run(
            TransferSpec {
                id: 1,
                serial: serial.clone(),
                direction: Direction::Push,
                local: local.to_string_lossy().into_owned(),
                remote: remote.clone(),
            },
            CancellationToken::new(),
            tx.clone(),
        )
        .await
        .expect("push 失败");
    assert_eq!(pushed, content.len() as u64, "push 字节数应等于内容长度");
    eprintln!("[真机] push 完成: {remote} ({pushed} bytes)");

    // 3) pull 回来并比对内容
    let pulled_path = std::env::temp_dir().join(format!("yovo-real-pull-{stamp}.txt"));
    runner
        .run(
            TransferSpec {
                id: 2,
                serial: serial.clone(),
                direction: Direction::Pull,
                local: pulled_path.to_string_lossy().into_owned(),
                remote: remote.clone(),
            },
            CancellationToken::new(),
            tx.clone(),
        )
        .await
        .expect("pull 失败");
    let pulled = std::fs::read_to_string(&pulled_path).expect("读回文件");
    assert_eq!(pulled, content, "pull 内容应与 push 一致");
    eprintln!("[真机] pull 内容一致");

    // 4) 新建目录 + 删除（core 侧 SafetyRoot）
    let mutator = FileMutator::new(client.clone());
    let dir = format!("/sdcard/yovo-real-dir-{stamp}");
    mutator.mkdir(&serial, &dir, CancellationToken::new()).await.expect("mkdir 失败");
    let entries_after = browser.list(&serial, "/sdcard", CancellationToken::new()).await.unwrap();
    assert!(entries_after.iter().any(|e| e.name == dir.trim_start_matches("/sdcard/")), "新目录应可见");
    mutator.delete(&serial, &dir, CancellationToken::new()).await.expect("删除目录失败");
    mutator.delete(&serial, &remote, CancellationToken::new()).await.expect("删除测试文件失败");
    eprintln!("[真机] mkdir/delete 完成，清理完毕");

    let _ = std::fs::remove_file(&local);
    let _ = std::fs::remove_file(&pulled_path);
}

#[tokio::test]
async fn real_safety_root_rejects_dangerous_path() {
    let client = Arc::new(AdbClient::new(
        ToolResolver::new(Some(real_adb()), PathBuf::from("n/a"), PathBuf::from("n/a")),
        4,
    ));
    let Some(serial) = online_device(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    let mutator = FileMutator::new(client);
    // 即使设备存在该路径，core 侧也必须拒绝（ADR-v6-013：不信任 UI）
    let result = mutator.delete(&serial, "/data/local/tmp", CancellationToken::new()).await;
    assert!(result.is_err(), "安全根外删除必须被 core 拒绝");
    let result = mutator.delete(&serial, "/sdcard/../data/x", CancellationToken::new()).await;
    assert!(result.is_err(), "路径穿越必须被 core 拒绝");
    eprintln!("[真机] SafetyRoot 拒绝危险路径验证通过");
}

/// 传输取消端到端：pull 设备上的大文件，中途取消 → Cancelled 状态事件 + 错误返回。
#[tokio::test]
async fn real_transfer_cancel_midflight() {
    let client = Arc::new(AdbClient::new(
        ToolResolver::new(Some(real_adb()), PathBuf::from("n/a3"), PathBuf::from("n/a3")),
        4,
    ));
    let Some(serial) = online_device(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    // 找一个设备上的大文件（≥10MB）作为拉取源；没有则跳过
    let browser = FileBrowser::new(client.clone());
    let entries = browser.list(&serial, "/storage/emulated/0/", CancellationToken::new()).await.unwrap();
    let Some(big) = entries.iter().find(|e| e.kind == yovo_protocol::EntryKind::File && e.size >= 10 * 1024 * 1024) else {
        eprintln!("跳过：设备无 ≥10MB 文件可拉取");
        return;
    };
    eprintln!("[真机] 取消测试拉取: {} ({} bytes)", big.name, big.size);

    let runner = TransferRunner::new(client);
    let (tx, mut rx) = mpsc::channel::<AppEvent>(16);
    let local = std::env::temp_dir().join(format!("yovo-cancel-{}-{}.bin", std::process::id(), big.name));
    let cancel = CancellationToken::new();
    let spec = TransferSpec {
        id: 77,
        serial: serial.clone(),
        direction: Direction::Pull,
        local: local.to_string_lossy().into_owned(),
        remote: format!("/storage/emulated/0/{}", big.name),
    };
    let handle = tokio::spawn({
        let runner = runner.clone();
        let tx = tx.clone();
        let cancel = cancel.clone();
        async move { runner.run(spec, cancel, tx).await }
    });

    // 等 Running 事件后取消
    let mut saw_running = false;
    let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
    while !saw_running && tokio::time::Instant::now() < deadline {
        if let Ok(Some(AppEvent::TransferProgress(p))) =
            tokio::time::timeout(Duration::from_millis(500), rx.recv()).await
        {
            saw_running = p.state == yovo_protocol::TransferState::Running;
        }
    }
    assert!(saw_running, "应进入 Running 状态");
    cancel.cancel();

    let result = tokio::time::timeout(Duration::from_secs(15), handle).await.expect("传输未按时终止");
    assert!(result.is_ok(), "join 失败");
    let outcome = result.expect("checked");
    assert!(outcome.is_err(), "取消应返回错误");
    eprintln!("[真机] 取消生效: {outcome:?}");
    let _ = std::fs::remove_file(&local);
}
