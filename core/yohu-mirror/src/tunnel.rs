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

pub fn random_scid() -> u32 {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u32)
        .unwrap_or(1);
    (nanos ^ std::process::id()).max(1) & 0x7FFF_FFFF
}

/// 预热隧道：jar 已按大小跳过 push，reverse/forward 已挂上。
pub struct WarmTunnel {
    pub scid: u32,
    pub port: u16,
    pub listener: Option<TcpListener>,
    pub used_forward: bool,
}

impl WarmTunnel {
    pub async fn drop_async(&self, adb: &AdbClient, serial: &str, _cancel: CancellationToken) {
        if self.used_forward {
            remove_forward(adb, serial, self.port).await;
        } else {
            remove_reverse(adb, serial, self.scid).await;
        }
    }
}

/// 按本地 jar 大小跳过重复 push。
pub async fn push_server_if_needed(
    adb: &AdbClient,
    serial: &str,
    local: &Path,
    cancel: CancellationToken,
) -> Result<(), MirrorError> {
    let local_len = match std::fs::metadata(local) {
        Ok(meta) => meta.len(),
        Err(_) => return push_server(adb, serial, local, cancel).await,
    };
    if jar_already_on_device(local_len, remote_jar_size(adb, serial, cancel.clone()).await) {
        tracing::info!(serial, size = local_len, "scrcpy-server 已在设备上，跳过 push");
        return Ok(());
    }
    push_server(adb, serial, local, cancel).await?;
    tracing::info!(serial, size = local_len, "scrcpy-server 已 push");
    Ok(())
}

async fn remote_jar_size(adb: &AdbClient, serial: &str, cancel: CancellationToken) -> Option<u64> {
    let out = adb
        .run(
            serial,
            &[
                "shell".into(),
                format!("stat -c %s {}", scrcpy::DEVICE_SERVER_PATH),
            ],
            Some(8_000),
            cancel,
        )
        .await
        .ok()?;
    if out.exit_code != 0 {
        return None;
    }
    out.stdout
        .split_whitespace()
        .next()
        .and_then(|s| s.parse().ok())
}

/// 预热：跳过重复 push，预绑 reverse（失败则 forward）。
pub async fn warmup(
    adb: &AdbClient,
    serial: &str,
    local: &Path,
    force_forward: bool,
    cancel: CancellationToken,
) -> Result<WarmTunnel, MirrorError> {
    push_server_if_needed(adb, serial, local, cancel.clone()).await?;
    if cancel.is_cancelled() {
        return Err(MirrorError::Cancelled);
    }
    let scid = random_scid();
    let (listener, port) = bind_local().await?;
    let mut used_forward = force_forward;
    let mut listener = Some(listener);
    if !used_forward {
        match setup_reverse(adb, serial, scid, port, cancel.clone()).await {
            Ok(()) => tracing::info!(serial, scid, port, "预热 reverse 已建立"),
            Err(e) => {
                tracing::warn!(serial, "预热 reverse 失败，改 forward: {e}");
                used_forward = true;
            }
        }
    }
    if used_forward {
        listener.take();
        setup_forward(adb, serial, scid, port, cancel).await?;
        tracing::info!(serial, scid, port, "预热 forward 已建立");
    }
    Ok(WarmTunnel {
        scid,
        port,
        listener,
        used_forward,
    })
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
            &["reverse".into(), abstract_spec(scid), format!("tcp:{port}")],
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
            &["forward".into(), format!("tcp:{port}"), abstract_spec(scid)],
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
            &["forward".into(), "--remove".into(), format!("tcp:{port}")],
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

/// forward 后续 socket（4.1 只在第一路发 dummy；控制通道不要再读那一字节）。
///
/// 必须在读设备名之前调用：server 先 `accept` 齐控制通道才 `sendDeviceMeta`。
pub async fn connect_tcp(port: u16, cancel: &CancellationToken) -> Result<TcpStream, MirrorError> {
    let addr = format!("127.0.0.1:{port}");
    let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
    loop {
        if cancel.is_cancelled() {
            return Err(MirrorError::Cancelled);
        }
        if tokio::time::Instant::now() >= deadline {
            return Err(MirrorError::Protocol("forward 控制通道连接失败".into()));
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
}

/// 本地 jar 与设备上文件大小一致则跳过 push。
pub fn jar_already_on_device(local_len: u64, remote_len: Option<u64>) -> bool {
    local_len > 0 && remote_len == Some(local_len)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skip_push_when_sizes_match() {
        assert!(jar_already_on_device(1234, Some(1234)));
        assert!(!jar_already_on_device(1234, Some(1)));
        assert!(!jar_already_on_device(1234, None));
        assert!(!jar_already_on_device(0, Some(0)));
    }
}
