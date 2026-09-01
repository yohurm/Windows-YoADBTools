//! 把 GitHub Release 安装包下到临时目录，流式 SHA-256 校验。

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;
use yohu_protocol::{UpdateDownloadResult, UpdateProgress, UpdateStage, PRODUCT_NAME};

use crate::error::UpdateError;

/// 安装包缓存上限（防异常 Content-Length 填盘）。
pub const MAX_INSTALLER_BYTES: u64 = 512 * 1024 * 1024;
const PROGRESS_INTERVAL: Duration = Duration::from_millis(200);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(10 * 60);

/// `%TEMP%\YohuAdbTools-update\`：不进 NSIS INSTDIR，覆盖安装时不会自删。
pub fn update_cache_dir() -> PathBuf {
    std::env::temp_dir().join(format!("{PRODUCT_NAME}-update"))
}

/// 从下载 URL 取出合法的 `.exe` 文件名。
pub fn installer_file_name(url: &str) -> Result<String, UpdateError> {
    let trimmed = url.trim();
    let without_query = trimmed.split(['?', '#']).next().unwrap_or(trimmed);
    let raw = without_query.rsplit('/').next().unwrap_or("").trim();
    if raw.is_empty() {
        return Err(UpdateError::InvalidInstaller);
    }
    let decoded = raw.replace("%20", " ");
    let lower = decoded.to_ascii_lowercase();
    if !lower.ends_with(".exe") {
        return Err(UpdateError::InvalidInstaller);
    }
    if decoded
        .chars()
        .any(|c| !(c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | ' ')))
    {
        return Err(UpdateError::InvalidInstaller);
    }
    if decoded.contains("..") {
        return Err(UpdateError::InvalidInstaller);
    }
    Ok(decoded)
}

/// 把检查结果里的 URL 编成缓存路径。
pub fn installer_dest(url: &str) -> Result<PathBuf, UpdateError> {
    Ok(update_cache_dir().join(installer_file_name(url)?))
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    hex_lower(&digest)
}

fn hex_lower(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

pub fn sha256_matches(expected: &str, actual: &str) -> bool {
    let exp = expected.trim();
    if exp.is_empty() {
        return true;
    }
    exp.eq_ignore_ascii_case(actual.trim())
}

/// 下载安装包到缓存目录；已存在且校验通过则跳过网络。
pub async fn download_installer(
    url: &str,
    expected_sha256: &str,
    expected_size: u64,
    token: &str,
    user_agent: &str,
    cancel: CancellationToken,
    mut on_progress: impl FnMut(UpdateProgress),
) -> Result<UpdateDownloadResult, UpdateError> {
    let url = crate::assert_http_url(url)?.to_string();
    if expected_size > MAX_INSTALLER_BYTES {
        return Err(UpdateError::TooLarge);
    }
    let dest = installer_dest(&url)?;
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| UpdateError::Io(e.to_string()))?;
    }

    if dest.is_file() {
        if let Ok(existing) = tokio::fs::read(&dest).await {
            let actual = sha256_hex(&existing);
            let size_ok = expected_size == 0 || existing.len() as u64 == expected_size;
            if size_ok && sha256_matches(expected_sha256, &actual) {
                let size = existing.len() as u64;
                on_progress(UpdateProgress {
                    version: String::new(),
                    stage: UpdateStage::Ready,
                    received_bytes: size,
                    total_bytes: size,
                });
                return Ok(UpdateDownloadResult {
                    path: dest.to_string_lossy().into_owned(),
                    size_bytes: size,
                });
            }
        }
        let _ = tokio::fs::remove_file(&dest).await;
    }

    let client = reqwest::Client::builder()
        .timeout(DOWNLOAD_TIMEOUT)
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| UpdateError::Network(e.to_string()))?;
    let mut req = client.get(&url).header("User-Agent", user_agent);
    if !token.trim().is_empty() {
        req = req.bearer_auth(token.trim());
    }
    let response = tokio::select! {
        biased;
        _ = cancel.cancelled() => return Err(UpdateError::Cancelled),
        sent = req.send() => sent?,
    };
    let status = response.status();
    if !status.is_success() {
        return Err(UpdateError::Http(status.as_u16()));
    }
    let header_len = response.content_length().unwrap_or(0);
    let total = if expected_size > 0 {
        expected_size
    } else {
        header_len
    };
    if total > MAX_INSTALLER_BYTES {
        return Err(UpdateError::TooLarge);
    }

    let part = dest.with_extension("exe.part");
    if part.exists() {
        let _ = tokio::fs::remove_file(&part).await;
    }
    let mut file = tokio::fs::File::create(&part)
        .await
        .map_err(|e| UpdateError::Io(e.to_string()))?;
    let mut hasher = Sha256::new();
    let mut received: u64 = 0;
    let mut last_emit = Instant::now() - PROGRESS_INTERVAL;
    let mut stream = response.bytes_stream();
    on_progress(UpdateProgress {
        version: String::new(),
        stage: UpdateStage::Downloading,
        received_bytes: 0,
        total_bytes: total,
    });

    loop {
        let chunk = tokio::select! {
            biased;
            _ = cancel.cancelled() => {
                drop(file);
                let _ = tokio::fs::remove_file(&part).await;
                return Err(UpdateError::Cancelled);
            }
            next = stream.next() => next,
        };
        let Some(chunk) = chunk else {
            break;
        };
        let chunk = chunk?;
        received = received.saturating_add(chunk.len() as u64);
        if received > MAX_INSTALLER_BYTES || (expected_size > 0 && received > expected_size) {
            drop(file);
            let _ = tokio::fs::remove_file(&part).await;
            return Err(UpdateError::TooLarge);
        }
        hasher.update(&chunk);
        file.write_all(&chunk)
            .await
            .map_err(|e| UpdateError::Io(e.to_string()))?;
        if last_emit.elapsed() >= PROGRESS_INTERVAL {
            last_emit = Instant::now();
            on_progress(UpdateProgress {
                version: String::new(),
                stage: UpdateStage::Downloading,
                received_bytes: received,
                total_bytes: total,
            });
        }
    }
    file.flush()
        .await
        .map_err(|e| UpdateError::Io(e.to_string()))?;
    drop(file);

    on_progress(UpdateProgress {
        version: String::new(),
        stage: UpdateStage::Verifying,
        received_bytes: received,
        total_bytes: total.max(received),
    });
    if expected_size > 0 && received != expected_size {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(UpdateError::SizeMismatch);
    }
    let actual = hex_lower(&hasher.finalize());
    if !sha256_matches(expected_sha256, &actual) {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(UpdateError::ChecksumMismatch);
    }
    tokio::fs::rename(&part, &dest)
        .await
        .map_err(|e| UpdateError::Io(e.to_string()))?;
    on_progress(UpdateProgress {
        version: String::new(),
        stage: UpdateStage::Ready,
        received_bytes: received,
        total_bytes: received,
    });
    Ok(UpdateDownloadResult {
        path: dest.to_string_lossy().into_owned(),
        size_bytes: received,
    })
}

/// 安装包必须落在更新缓存目录内的 `.exe`。
pub fn assert_cached_installer(path: &Path) -> Result<PathBuf, UpdateError> {
    if !path.is_absolute() {
        return Err(UpdateError::InvalidInstaller);
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .eq_ignore_ascii_case("exe");
    if !ext {
        return Err(UpdateError::InvalidInstaller);
    }
    if !path.is_file() {
        return Err(UpdateError::InstallerNotFound);
    }
    let cache = update_cache_dir()
        .canonicalize()
        .map_err(|_| UpdateError::InstallerNotFound)?;
    let file = path
        .canonicalize()
        .map_err(|_| UpdateError::InstallerNotFound)?;
    if !file.starts_with(&cache) {
        return Err(UpdateError::InvalidInstaller);
    }
    Ok(file)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn installer_file_name_from_github_asset() {
        let name = installer_file_name(
            "https://github.com/yohurm/Windows-YoADBTools/releases/download/v0.1.2/YohuAdbTools_0.1.2_x64-setup.exe",
        )
        .unwrap();
        assert_eq!(name, "YohuAdbTools_0.1.2_x64-setup.exe");
    }

    #[test]
    fn installer_file_name_rejects_html_release_page() {
        assert!(matches!(
            installer_file_name("https://github.com/yohurm/Windows-YoADBTools/releases/tag/v0.1.2"),
            Err(UpdateError::InvalidInstaller)
        ));
    }

    #[test]
    fn sha256_empty_expected_always_matches() {
        assert!(sha256_matches("", "deadbeef"));
        assert!(sha256_matches("AB", "ab"));
        assert!(!sha256_matches("aa", "bb"));
    }

    #[test]
    fn sha256_hex_known() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[tokio::test]
    async fn download_from_local_http_verifies_hash() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let body = b"nsis-setup-bytes";
        let sha = sha256_hex(body);
        tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            let mut buf = vec![0u8; 1024];
            let _ = sock.read(&mut buf).await;
            let header = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = sock.write_all(header.as_bytes()).await;
            let _ = sock.write_all(body).await;
        });
        let url = format!("http://{addr}/YohuAdbTools_test_x64-setup.exe");
        let dest = installer_dest(&url).unwrap();
        let _ = tokio::fs::remove_file(&dest).await;
        let result = download_installer(
            &url,
            &sha,
            body.len() as u64,
            "",
            "YohuAdbTools/0.1.2",
            CancellationToken::new(),
            |_| {},
        )
        .await
        .unwrap();
        assert_eq!(tokio::fs::read(&result.path).await.unwrap(), body);
        let _ = tokio::fs::remove_file(&result.path).await;
    }
}
