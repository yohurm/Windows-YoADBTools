//! 应用更新检查 / 下载 / 覆盖安装的 IPC wire 类型。

use serde::{Deserialize, Serialize};

/// 远程更新信息（`update.check` 响应）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RemoteUpdate {
    pub has_new_version: bool,
    pub version: String,
    #[serde(default)]
    pub version_code: u32,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub download_url: String,
    #[serde(default)]
    pub force_update: bool,
    #[serde(default)]
    pub md5: String,
    #[serde(default)]
    pub sha256: String,
    #[serde(default)]
    pub size_bytes: u64,
}

/// `update.download` 请求（URL 必须是检查结果里的 http(s) 安装包）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdateDownloadRequest {
    pub url: String,
    #[serde(default)]
    pub sha256: String,
    #[serde(default)]
    pub size_bytes: u64,
    #[serde(default)]
    pub version: String,
}

/// `update.download` 响应：本机已校验的安装包路径。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdateDownloadResult {
    pub path: String,
    pub size_bytes: u64,
}

/// 下载 / 覆盖安装阶段（`update/progress`）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UpdateStage {
    Downloading,
    Verifying,
    Ready,
    Applying,
}

/// 应用更新进度（200ms 节流；阶段切换必达）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdateProgress {
    pub version: String,
    pub stage: UpdateStage,
    pub received_bytes: u64,
    pub total_bytes: u64,
}

impl RemoteUpdate {
    pub fn with_download_url(&self, download_url: impl Into<String>) -> Self {
        let mut next = self.clone();
        next.download_url = download_url.into();
        next
    }
}

/// 当前更新通道摘要（`update.info`；不含密钥）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdateChannelInfo {
    #[serde(default)]
    pub remote: String,
    #[serde(default)]
    pub page_url: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remote_update_snake_case() {
        let v = serde_json::to_value(RemoteUpdate {
            has_new_version: true,
            version: "1.2.0".into(),
            version_code: 12,
            description: "fix".into(),
            download_url: "https://example.com/setup.exe".into(),
            force_update: false,
            md5: "m".into(),
            sha256: "s".into(),
            size_bytes: 100,
        })
        .unwrap();
        assert_eq!(v["has_new_version"], true);
        assert_eq!(v["version_code"], 12);
        assert_eq!(v["download_url"], "https://example.com/setup.exe");
        assert_eq!(v["force_update"], false);
        assert_eq!(v["size_bytes"], 100);
    }

    #[test]
    fn channel_info_snake_case() {
        let v = serde_json::to_value(UpdateChannelInfo {
            remote: "yohurm/Windows-YoADBTools".into(),
            page_url: "https://github.com/yohurm/Windows-YoADBTools".into(),
        })
        .unwrap();
        assert_eq!(v["remote"], "yohurm/Windows-YoADBTools");
        assert_eq!(
            v["page_url"],
            "https://github.com/yohurm/Windows-YoADBTools"
        );
    }

    #[test]
    fn download_request_and_progress_snake_case() {
        let req = serde_json::to_value(UpdateDownloadRequest {
            url: "https://example.com/setup.exe".into(),
            sha256: "ab".into(),
            size_bytes: 9,
            version: "0.1.2".into(),
        })
        .unwrap();
        assert_eq!(req["download_url"], serde_json::Value::Null);
        assert_eq!(req["url"], "https://example.com/setup.exe");
        assert_eq!(req["size_bytes"], 9);

        let progress = serde_json::to_value(UpdateProgress {
            version: "0.1.2".into(),
            stage: UpdateStage::Downloading,
            received_bytes: 1,
            total_bytes: 2,
        })
        .unwrap();
        assert_eq!(progress["received_bytes"], 1);
        assert_eq!(progress["stage"], "downloading");
    }
}
