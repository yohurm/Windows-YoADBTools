//! 真机：HEVC Annex-B → 进程内 MF → 连续 NV12（禁止只出首帧）。
//! 无设备时自动跳过。

#![cfg(windows)]
#![allow(clippy::await_holding_lock)]

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use yohu_adb::{AdbClient, ToolResolver};
use yohu_adbtools_lib::MfDecoder;
use yohu_mirror::{MirrorService, MirrorSessionRequest};
use yohu_protocol::AppEvent;

fn lock_device() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    LOCK.lock().expect("mf live lock poisoned")
}

fn tools_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tools")
}

fn client() -> Arc<AdbClient> {
    let tools = tools_dir();
    Arc::new(AdbClient::new(
        ToolResolver::new(
            Some(tools.join("adb.exe")),
            std::env::temp_dir().join(format!("yohu-mf-res-{}", std::process::id())),
            std::env::temp_dir().join(format!("yohu-mf-data-{}", std::process::id())),
        ),
        4,
    ))
}

fn access_unit(config: Option<&[u8]>, payload: &[u8], keyframe: bool) -> Vec<u8> {
    if keyframe {
        if let Some(cfg) = config {
            let mut au = Vec::with_capacity(cfg.len() + payload.len());
            au.extend_from_slice(cfg);
            au.extend_from_slice(payload);
            return au;
        }
    }
    payload.to_vec()
}

#[tokio::test(flavor = "multi_thread")]
async fn real_hevc_mf_keeps_emitting_nv12() {
    let _guard = lock_device();
    let client = client();
    let devices = client
        .devices(CancellationToken::new())
        .await
        .expect("devices");
    let Some(dev) = devices
        .iter()
        .find(|d| d.state == yohu_protocol::DeviceState::Online)
    else {
        eprintln!("跳过：无在线设备");
        return;
    };
    let serial = dev.serial.clone();
    eprintln!("[真机 MF] serial={serial}");

    let jar = tools_dir().join("scrcpy-server");
    assert!(jar.is_file(), "缺少 tools/scrcpy-server");

    let (tx, _rx) = mpsc::channel::<AppEvent>(256);
    let service = MirrorService::new(client, tx, jar);
    let started = service
        .start(MirrorSessionRequest {
            serial: serial.clone(),
            max_size: 0,
            video_bit_rate: 16_000_000,
            max_fps: 0,
            control: false,
            force_forward: false,
            video_codec: "h265".into(),
        })
        .await
        .expect("mirror.start");
    let pipe = service.frame_pipe(&serial).expect("frame pipe");

    let mut decoder: Option<MfDecoder> = None;
    let mut last_config: Option<Vec<u8>> = None;
    let mut nv12 = 0u32;
    let mut fed = 0u32;
    let deadline = Instant::now() + Duration::from_secs(12);
    while Instant::now() < deadline && nv12 < 12 {
        let Some(frame) = tokio::time::timeout(Duration::from_millis(800), pipe.recv())
            .await
            .ok()
            .flatten()
        else {
            continue;
        };
        if frame.config {
            last_config = Some(frame.payload.clone());
        }
        if decoder.is_none() && frame.width > 0 && frame.height > 0 {
            match MfDecoder::open(frame.codec == 1, frame.width, frame.height) {
                Ok(dec) => {
                    eprintln!(
                        "[真机 MF] 解码器 hevc={} async={} d3d={} {}x{}",
                        frame.codec == 1,
                        dec.is_async(),
                        dec.uses_d3d(),
                        frame.width,
                        frame.height
                    );
                    decoder = Some(dec);
                }
                Err(e) => {
                    service.stop(&serial).await;
                    panic!("打开 MF 失败: {e}");
                }
            }
        }
        if frame.config {
            continue;
        }
        let Some(dec) = decoder.as_mut() else {
            continue;
        };
        let au = access_unit(last_config.as_deref(), &frame.payload, frame.keyframe);
        fed += 1;
        match dec.feed(&au, frame.keyframe) {
            Ok(Some(_)) => nv12 += 1,
            Ok(None) => {
                if let Ok(Some(_)) = dec.drain() {
                    nv12 += 1;
                }
            }
            Err(e) => {
                service.stop(&serial).await;
                panic!("MF 解码失败 fed={fed} nv12={nv12}: {e}");
            }
        }
    }
    service.stop(&serial).await;
    eprintln!(
        "[真机 MF] generation={} fed={fed} nv12={nv12}",
        started.generation
    );
    assert!(
        nv12 >= 8,
        "应连续出 NV12，实际 nv12={nv12} fed={fed}（只出首帧或不出画）"
    );
}
