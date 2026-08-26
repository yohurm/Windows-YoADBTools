//! ADB reverse / forward 隧道（设备 abstract socket ↔ 本机 TCP）。

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use tokio::net::{TcpListener, TcpStream};
use tokio_util::sync::CancellationToken;
use yohu_adb::AdbClient;
use yohu_protocol::scrcpy;

use crate::error::MirrorError;

pub fn socket_name(scid: u32) -> String {
    format!("scrcpy_{scid:08x}")
}

pub fn abstract_spec(scid: u32) -> String {
    format!("localabstract:{}", socket_name(scid))
}

/// 绑定本机环回任意端口。
pub async fn bind_local() -> Result<(TcpListener, u16), MirrorError> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    Ok((listener, port))
}

pub async fn setup_reverse(
    adb: &AdbClient,
    serial: &str,
    scid: u32,
    port: u16,
    cancel: CancellationToken,
) -> Result<(), MirrorError> {
    let out = adb
        .run(
            serial,
            &[
                "reverse".into(),
                abstract_spec(scid),
                format!("tcp:{port}"),
            ],
            Some(10_000),
            cancel,
        )
        .await?;
    if out.exit_code != 0 {
        return Err(MirrorError::Adb(yohu_adb::AdbError::BadExit {
            exit_code: out.exit_code,
            stderr: out.stderr,
        }));
    }
    Ok(())
}

pub async fn setup_forward(
    adb: &AdbClient,
    serial: &str,
    scid: u32,
    port: u16,
    cancel: CancellationToken,
) -> Result<(), MirrorError> {
    let out = adb
        .run(
            serial,
            &[
                "forward".into(),
                format!("tcp:{port}"),
                abstract_spec(scid),
            ],
            Some(10_000),
            cancel,
        )
        .await?;
    if out.exit_code != 0 {
        return Err(MirrorError::Adb(yohu_adb::AdbError::BadExit {
            exit_code: out.exit_code,
            stderr: out.stderr,
        }));
    }
    Ok(())
}

pub async fn remove_reverse(adb: &AdbClient, serial: &str, scid: u32) {
    let _ = adb
        .run(
            serial,
            &["reverse".into(), "--remove".into(), abstract_spec(scid)],
            Some(5_000),
            CancellationToken::new(),
        )
        .await;
}

pub async fn remove_forward(adb: &AdbClient, serial: &str, port: u16) {
    let _ = adb
        .run(
            serial,
            &[
                "forward".into(),
                "--remove".into(),
                format!("tcp:{port}"),
            ],
            Some(5_000),
            CancellationToken::new(),
        )
        .await;
}

pub async fn push_server(
    adb: &AdbClient,
    serial: &str,
    local: &Path,
    cancel: CancellationToken,
) -> Result<(), MirrorError> {
    let out = adb
        .run(
            serial,
            &[
                "push".into(),
                local.to_string_lossy().into_owned(),
                scrcpy::DEVICE_SERVER_PATH.into(),
            ],
            Some(60_000),
            cancel,
        )
        .await?;
    if out.exit_code != 0 {
        return Err(MirrorError::Adb(yohu_adb::AdbError::BadExit {
            exit_code: out.exit_code,
            stderr: out.stderr,
        }));
    }
    Ok(())
}

/// reverse：等设备连入。cancel 或超时则失败。
pub async fn accept_one(
    listener: &TcpListener,
    cancel: &CancellationToken,
    timeout: Duration,
) -> Result<TcpStream, MirrorError> {
    tokio::select! {
        biased;
        _ = cancel.cancelled() => Err(MirrorError::Cancelled),
        _ = tokio::time::sleep(timeout) => Err(MirrorError::Protocol("等待设备连接超时".into())),
        accepted = listener.accept() => {
            let (stream, _) = accepted?;
            let _ = stream.set_nodelay(true);
            Ok(stream)
        }
    }
}

/// forward：轮询连接本机 adb 转发端口，并读 dummy byte。
pub async fn connect_forward(
    port: u16,
    cancel: &CancellationToken,
    process_alive: Arc<std::sync::atomic::AtomicBool>,
) -> Result<TcpStream, MirrorError> {
    let addr = format!("127.0.0.1:{port}");
    for _ in 0..100 {
        if cancel.is_cancelled() {
            return Err(MirrorError::Cancelled);
        }
        if !process_alive.load(std::sync::atomic::Ordering::Relaxed) {
            return Err(MirrorError::ServerFailed("server 在建立隧道前退出".into()));
        }
        if let Ok(mut stream) = TcpStream::connect(&addr).await {
            let _ = stream.set_nodelay(true);
            let mut dummy = [0u8; 1];
            match tokio::time::timeout(
                Duration::from_millis(200),
                tokio::io::AsyncReadExt::read_exact(&mut stream, &mut dummy),
            )
            .await
            {
                Ok(Ok(_)) => return Ok(stream),
                Ok(Err(_)) | Err(_) => {
                    // 隧道在、server 未就绪：关掉重试
                }
            }
        }
        tokio::select! {
            _ = cancel.cancelled() => return Err(MirrorError::Cancelled),
            _ = tokio::time::sleep(Duration::from_millis(100)) => {}
        }
    }
    Err(MirrorError::Protocol("forward 隧道连接失败".into()))
}

/// forward 后续 socket（不再发 dummy）。
pub async fn connect_tcp(
    port: u16,
    cancel: &CancellationToken,
) -> Result<TcpStream, MirrorError> {
    let addr = format!("127.0.0.1:{port}");
    for _ in 0..50 {
        if cancel.is_cancelled() {
            return Err(MirrorError::Cancelled);
        }
        if let Ok(stream) = TcpStream::connect(&addr).await {
            let _ = stream.set_nodelay(true);
            return Ok(stream);
        }
        tokio::select! {
            _ = cancel.cancelled() => return Err(MirrorError::Cancelled),
            _ = tokio::time::sleep(Duration::from_millis(50)) => {}
        }
    }
    Err(MirrorError::Protocol("forward 控制通道连接失败".into()))
}
