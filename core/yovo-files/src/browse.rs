//! 设备文件浏览（ls 解析）。

use std::sync::Arc;

use tokio_util::sync::CancellationToken;

use crate::FileError;
use yovo_adb::AdbClient;
use yovo_domain::RemotePath;
use yovo_protocol::RemoteEntry;

/// 文件浏览器。
pub struct FileBrowser {
    adb: Arc<AdbClient>,
}

impl FileBrowser {
    pub fn new(adb: Arc<AdbClient>) -> Self {
        Self { adb }
    }

    /// 列出设备目录（路径经规范化；不强制安全根——浏览范围可大于删除范围）。
    ///
    /// 尾斜杠语义：`ls -la /sdcard/` 会跟随符号链接列出目标目录内容
    /// （部分机型 `/sdcard -> /storage/self/primary`，不带尾斜杠只列出链接本身）。
    pub async fn list(
        &self,
        serial: &str,
        path: &str,
        cancel: CancellationToken,
    ) -> Result<Vec<RemoteEntry>, FileError> {
        let normalized = RemotePath::parse(path).map_err(|e| FileError::Path(e.to_string()))?;
        let listing = if normalized.as_str().ends_with('/') {
            normalized.as_str().to_string()
        } else {
            format!("{}/", normalized.as_str())
        };
        Ok(self.adb.ls(serial, &listing, cancel).await?)
    }
}
