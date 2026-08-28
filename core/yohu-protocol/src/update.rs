//! 应用更新检查的 IPC wire 类型。

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
    pub provider: crate::UpdateProvider,
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
            provider: crate::UpdateProvider::Github,
            remote: "yohurm/Windows-YoADBTools".into(),
            page_url: "https://github.com/yohurm/Windows-YoADBTools".into(),
        })
        .unwrap();
        assert_eq!(v["provider"], "github");
        assert_eq!(v["remote"], "yohurm/Windows-YoADBTools");
        assert_eq!(
            v["page_url"],
            "https://github.com/yohurm/Windows-YoADBTools"
        );
    }
}
