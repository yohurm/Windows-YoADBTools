//! 本机平台信息：检查更新时交给 Provider（版本比较 / 安装包筛选）。

use yohu_protocol::AppIdentity;

/// 当前安装的平台身份（版本 / 包标识 / OS / 架构）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlatformInfo {
    pub version: String,
    pub identifier: String,
    pub os: String,
    pub arch: String,
}

impl PlatformInfo {
    /// 用应用身份填充；OS / 架构取编译目标。
    pub fn from_identity(identity: &AppIdentity) -> Self {
        Self {
            version: identity.version.clone(),
            identifier: identity.identifier.clone(),
            os: std::env::consts::OS.to_string(),
            arch: std::env::consts::ARCH.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use yohu_protocol::{AppIdentity, IDENTIFIER};

    #[test]
    fn from_identity_keeps_version_and_package_id() {
        let info = PlatformInfo::from_identity(&AppIdentity::with_version("0.1.0"));
        assert_eq!(info.version, "0.1.0");
        assert_eq!(info.identifier, IDENTIFIER);
        assert!(!info.os.is_empty());
        assert!(!info.arch.is_empty());
    }
}
