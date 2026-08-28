//! 真实设备集成测试（投屏：yohu-mirror 自写客户端 + 官方 scrcpy-server 4.1）。
//!
//! 自底而上：push jar → reverse/forward 隧道 → app_process → Live + 编码包 → 停止。
//! 无在线设备时自动跳过。运行：
//! `cargo test -p yohu-mirror --test real_device -- --nocapture`

// 真机同 serial 不能并行两路，测试用静态 Mutex 串行化；锁在设计上跨 await 持有（有意为之）。
// 该 lint 会因持有锁跨 await 触发，属预期，予以全局豁免。
#![allow(clippy::await_holding_lock)]

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

/// 真机投屏同一 serial 不能并行两路；测试串行化。
/// `#[tokio::test]` 各有独立 runtime，必须用 `std::sync::Mutex`。
fn lock_device() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    LOCK.lock().expect("mirror real-device lock poisoned")
}

use yohu_adb::{AdbClient, ToolResolver};
use yohu_mirror::MirrorService;
use yohu_protocol::{
    scrcpy, AppEvent, MirrorControlMessage, MirrorPacket, MirrorSessionState, MirrorStartRequest,
};

fn real_adb() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tools/adb.exe")
}

fn server_jar() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tools/scrcpy-server")
}

fn client() -> Arc<AdbClient> {
    Arc::new(AdbClient::new(
        ToolResolver::new(
            Some(real_adb()),
            std::env::temp_dir().join(format!("yohu-mirror-res-{}", std::process::id())),
            std::env::temp_dir().join(format!("yohu-mirror-data-{}", std::process::id())),
        ),
        4,
    ))
}

/// 优先手机；Family Hub 一类大屏作备选。
async fn online_phone(client: &AdbClient) -> Option<String> {
    let devices = client.devices(CancellationToken::new()).await.ok()?;
    let online: Vec<_> = devices
        .into_iter()
        .filter(|d| d.state == yohu_protocol::DeviceState::Online)
        .collect();
    online
        .iter()
        .find(|d| {
            !d.model
                .as_deref()
                .unwrap_or("")
                .to_ascii_lowercase()
                .contains("family")
        })
        .or(online.first())
        .map(|d| d.serial.clone())
}

fn start_req(serial: &str, control: bool, force_forward: bool) -> MirrorStartRequest {
    MirrorStartRequest {
        serial: serial.to_string(),
        max_size: 640,
        video_bit_rate: 1_000_000,
        max_fps: 15,
        control,
        force_forward,
    }
}

struct LiveStream {
    packets: usize,
    config: bool,
    keyframe: bool,
    width: u32,
    height: u32,
    codec: String,
    failed: Option<String>,
}

async fn wait_live_packets(
    rx: &mut mpsc::Receiver<AppEvent>,
    serial: &str,
    generation: u64,
    min_packets: usize,
    timeout: Duration,
) -> LiveStream {
    let mut out = LiveStream {
        packets: 0,
        config: false,
        keyframe: false,
        width: 0,
        height: 0,
        codec: String::new(),
        failed: None,
    };
    let deadline = tokio::time::Instant::now() + timeout;
    while tokio::time::Instant::now() < deadline {
        let remain = deadline.saturating_duration_since(tokio::time::Instant::now());
        match tokio::time::timeout(remain.min(Duration::from_millis(400)), rx.recv()).await {
            Ok(Some(AppEvent::MirrorState {
                serial: s,
                generation: g,
                state,
                width,
                height,
                codec,
                error,
                ..
            })) if s == serial && g == generation => {
                if width > 0 {
                    out.width = width;
                    out.height = height;
                }
                if !codec.is_empty() {
                    out.codec = codec;
                }
                match state {
                    MirrorSessionState::Live => {}
                    MirrorSessionState::Failed => {
                        out.failed = error.or_else(|| Some("failed".into()));
                        return out;
                    }
                    MirrorSessionState::Stopped if out.packets > 0 => return out,
                    _ => {}
                }
            }
            Ok(Some(AppEvent::MirrorPacket(MirrorPacket {
                serial: s,
                generation: g,
                config,
                keyframe,
                width,
                height,
                codec,
                ..
            }))) if s == serial && g == generation => {
                out.packets += 1;
                out.config |= config;
                out.keyframe |= keyframe;
                if width > 0 {
                    out.width = width;
                    out.height = height;
                    out.codec = codec;
                }
                if out.packets >= min_packets && out.config && out.keyframe {
                    return out;
                }
            }
            Ok(Some(_)) => {}
            Ok(None) => break,
            Err(_) => {}
        }
    }
    out
}

#[tokio::test]
async fn real_mirror_push_server_jar() {
    let _guard = lock_device();
    let client = client();
    let Some(serial) = online_phone(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    let jar = server_jar();
    assert!(jar.is_file(), "缺少 tools/scrcpy-server，请运行 setup-scrcpy-server.ps1");
    let out = client
        .run(
            &serial,
            &[
                "push".into(),
                jar.to_string_lossy().into_owned(),
                scrcpy::DEVICE_SERVER_PATH.into(),
            ],
            Some(60_000),
            CancellationToken::new(),
        )
        .await
        .expect("push scrcpy-server");
    assert_eq!(out.exit_code, 0, "push 失败: {}", out.stderr);
    eprintln!(
        "[真机] push {} → {} ({serial})",
        jar.display(),
        scrcpy::DEVICE_SERVER_PATH
    );
}

#[tokio::test]
async fn real_mirror_video_only_live_packets() {
    let _guard = lock_device();
    let client = client();
    let Some(serial) = online_phone(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    eprintln!("[真机] 投屏设备 {serial}");

    let (tx, mut rx) = mpsc::channel::<AppEvent>(4096);
    let service = MirrorService::new(client, tx, server_jar());
    let started = service
        .start(start_req(&serial, false, false))
        .await
        .expect("mirror.start");
    assert!(!started.adopted);
    assert!(service.status(&serial).mirroring);

    let stream = wait_live_packets(&mut rx, &serial, started.generation, 8, Duration::from_secs(40))
        .await;
    if stream.failed.is_some() || stream.packets < 8 || !stream.config || !stream.keyframe {
        service.stop(&serial).await;
        if let Some(err) = stream.failed {
            panic!("投屏失败: {err}");
        }
        panic!(
            "应收到编码包，实际 {} config={} key={} {}x{} codec={}",
            stream.packets,
            stream.config,
            stream.keyframe,
            stream.width,
            stream.height,
            stream.codec
        );
    }
    assert_eq!(stream.codec, "h264");
    assert!(stream.width >= 16 && stream.height >= 16, "尺寸 {}x{}", stream.width, stream.height);
    eprintln!(
        "[真机] Live {}x{} {} 包={} config={} key={}",
        stream.width, stream.height, stream.codec, stream.packets, stream.config, stream.keyframe
    );

    let adopted = service
        .start(start_req(&serial, false, false))
        .await
        .expect("adopt");
    assert!(adopted.adopted, "Live 中二次 start 应 adopt");
    assert_eq!(adopted.generation, started.generation);

    service.stop(&serial).await;
    assert!(!service.status(&serial).mirroring, "停止后不应仍在投屏");
    eprintln!("[真机] 停止完成");
}

#[tokio::test]
async fn real_mirror_force_forward_live() {
    let _guard = lock_device();
    let client = client();
    let Some(serial) = online_phone(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    let (tx, mut rx) = mpsc::channel::<AppEvent>(4096);
    let service = MirrorService::new(client, tx, server_jar());
    let started = service
        .start(start_req(&serial, false, true))
        .await
        .expect("forward start");
    let stream = wait_live_packets(&mut rx, &serial, started.generation, 3, Duration::from_secs(40))
        .await;
    service.stop(&serial).await;
    if let Some(err) = stream.failed {
        panic!("force_forward 失败: {err}");
    }
    assert!(
        stream.packets >= 3,
        "forward 隧道应出包，实际 {} {}x{}",
        stream.packets,
        stream.width,
        stream.height
    );
    eprintln!(
        "[真机] force_forward Live {}x{} 包={}",
        stream.width, stream.height, stream.packets
    );
}

#[tokio::test]
async fn real_mirror_control_force_forward_live() {
    let _guard = lock_device();
    let client = client();
    let Some(serial) = online_phone(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    let (tx, mut rx) = mpsc::channel::<AppEvent>(4096);
    let service = MirrorService::new(client, tx, server_jar());
    let started = service
        .start(start_req(&serial, true, true))
        .await
        .expect("control+forward start");
    let stream = wait_live_packets(&mut rx, &serial, started.generation, 2, Duration::from_secs(40))
        .await;
    service.stop(&serial).await;
    if let Some(err) = stream.failed {
        panic!("control+force_forward 失败: {err}");
    }
    assert!(
        stream.packets >= 2 && stream.width > 0,
        "控制+forward 应进入 Live 并出包，实际 {} {}x{}",
        stream.packets,
        stream.width,
        stream.height
    );
    eprintln!(
        "[真机] control+forward Live {}x{} 包={}",
        stream.width, stream.height, stream.packets
    );
}

#[tokio::test]
async fn real_mirror_control_inject() {
    let _guard = lock_device();
    let client = client();
    let Some(serial) = online_phone(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    let (tx, mut rx) = mpsc::channel::<AppEvent>(4096);
    let service = MirrorService::new(client, tx, server_jar());
    let started = service
        .start(start_req(&serial, true, false))
        .await
        .expect("control start");
    let stream = wait_live_packets(&mut rx, &serial, started.generation, 2, Duration::from_secs(40))
        .await;
    if stream.failed.is_some() || stream.packets < 2 {
        service.stop(&serial).await;
        if let Some(err) = stream.failed {
            panic!("带控制启动失败: {err}");
        }
        panic!("带控制启动也应出包，实际 {}", stream.packets);
    }
    assert!(
        service.status(&serial).control,
        "Live 后 status.control 应为 true"
    );
    service
        .inject(&serial, MirrorControlMessage::DisplayPower { on: true })
        .await
        .expect("inject display_power");
    eprintln!("[真机] 控制注入 DisplayPower 成功");
    service.stop(&serial).await;
}

#[tokio::test]
async fn real_mirror_missing_server_errors() {
    let _guard = lock_device();
    let client = client();
    let Some(serial) = online_phone(&client).await else {
        eprintln!("跳过：无在线设备");
        return;
    };
    let (tx, mut rx) = mpsc::channel::<AppEvent>(16);
    let service = MirrorService::new(
        client,
        tx,
        PathBuf::from("Z:/definitely-missing-scrcpy-server"),
    );
    let started = service
        .start(start_req(&serial, false, false))
        .await
        .expect("start 在 Starting 阶段返回");
    let stream = wait_live_packets(&mut rx, &serial, started.generation, 1, Duration::from_secs(8))
        .await;
    assert!(
        stream.failed.is_some(),
        "缺少 server 应 Failed，实际 packets={}",
        stream.packets
    );
    assert!(
        stream
            .failed
            .as_deref()
            .unwrap_or("")
            .contains("scrcpy-server"),
        "错误应提到 scrcpy-server: {:?}",
        stream.failed
    );
    eprintln!("[真机] 缺 server 失败文案: {:?}", stream.failed);
}
