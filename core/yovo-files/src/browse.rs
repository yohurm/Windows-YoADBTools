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
    pub async fn list(
        &self,
        serial: &str,
        path: &str,
        cancel: CancellationToken,
    ) -> Result<Vec<RemoteEntry>, FileError> {
        let normalized = RemotePath::parse(path).map_err(|e| FileError::Path(e.to_string()))?;
        Ok(self.adb.ls(serial, normalized.as_str(), cancel).await?)
    }
}
