//! 设备文件浏览（ls 解析）。

use std::sync::Arc;

use tokio_util::sync::CancellationToken;

use crate::FileError;
use yohu_adb::AdbClient;
use yohu_domain::SafetyRoot;
use yohu_protocol::RemoteEntry;

/// 文件浏览器。
pub struct FileBrowser {
    adb: Arc<AdbClient>,
    safety: SafetyRoot,
}

impl FileBrowser {
    pub fn new(adb: Arc<AdbClient>) -> Self {
        Self { adb, safety: SafetyRoot::default() }
    }

    /// 列出设备目录。路径必须位于安全根内（含根本身）；不信任 UI。
    ///
    /// 尾斜杠语义：`ls -la /sdcard/` 会跟随符号链接列出目标目录内容
    /// （部分机型 `/sdcard -> /storage/self/primary`，不带尾斜杠只列出链接本身）。
    pub async fn list(
        &self,
        serial: &str,
        path: &str,
        cancel: CancellationToken,
    ) -> Result<Vec<RemoteEntry>, FileError> {
        let normalized = self
            .safety
            .check(path)
            .map_err(|e| FileError::OutsideRoot(e.to_string()))?;
        let listing = format!("{}/", normalized.as_str());
        Ok(self.adb.ls(serial, &listing, cancel).await?)
    }
}
