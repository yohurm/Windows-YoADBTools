//! 蒲公英检查 Provider：用平台身份 POST `/apiv2/app/check`。

use std::time::Duration;

use reqwest::Client;

use crate::contract::UpdateCheckProvider;
use crate::error::UpdateError;
use crate::mapper::{self, form_encode};
use crate::platform::PlatformInfo;
use yohu_protocol::RemoteUpdate;

const CHECK_ENDPOINT: &str = "https://api.pgyer.com/apiv2/app/check";

/// 蒲公英 `_api_key` + `appKey`。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PgyerCredentials {
    pub api_key: String,
    pub app_key: String,
}

impl PgyerCredentials {
    pub fn new(
        api_key: impl Into<String>,
        app_key: impl Into<String>,
    ) -> Result<Self, UpdateError> {
        let creds = Self {
            api_key: api_key.into().trim().to_string(),
            app_key: app_key.into().trim().to_string(),
        };
        if creds.api_key.is_empty() || creds.app_key.is_empty() {
            return Err(UpdateError::NotConfigured);
        }
        Ok(creds)
    }
}

/// 蒲公英 `app/check` Provider。
pub struct PgyerCheckProvider {
    credentials: PgyerCredentials,
    endpoint: String,
    client: Client,
}

impl PgyerCheckProvider {
    pub fn new(credentials: PgyerCredentials) -> Result<Self, UpdateError> {
        Self::with_endpoint(credentials, CHECK_ENDPOINT)
    }

    pub fn with_endpoint(
        credentials: PgyerCredentials,
        endpoint: impl Into<String>,
    ) -> Result<Self, UpdateError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| UpdateError::Network(e.to_string()))?;
        Ok(Self {
            credentials,
            endpoint: endpoint.into(),
            client,
        })
    }
}

impl UpdateCheckProvider for PgyerCheckProvider {
    async fn check(&self, platform: &PlatformInfo) -> Result<RemoteUpdate, UpdateError> {
        let body = check_form(platform, &self.credentials);
        let response = self
            .client
            .post(&self.endpoint)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(body)
            .send()
            .await?;
        let status = response.status();
        if !status.is_success() {
            return Err(UpdateError::Http(status.as_u16()));
        }
        let text = response.text().await?;
        parse_check_body(&text, &self.credentials.api_key)
    }
}

/// 平台信息 → 蒲公英 check 表单（官方字段 + 当前版本）。
pub fn check_form(platform: &PlatformInfo, credentials: &PgyerCredentials) -> String {
    [
        ("_api_key", credentials.api_key.as_str()),
        ("appKey", credentials.app_key.as_str()),
        ("buildVersion", platform.version.as_str()),
    ]
    .into_iter()
    .map(|(k, v)| format!("{}={}", form_encode(k), form_encode(v)))
    .collect::<Vec<_>>()
    .join("&")
}

pub fn parse_check_body(body: &str, api_key: &str) -> Result<RemoteUpdate, UpdateError> {
    let json: serde_json::Value =
        serde_json::from_str(body).map_err(|e| UpdateError::Parse(e.to_string()))?;
    let code = json.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
    if code != 0 {
        let message = json
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown error");
        return Err(UpdateError::Platform(message.to_string()));
    }
    let data = json.get("data").cloned().unwrap_or(serde_json::Value::Null);
    let download_url = opt_str(&data, "downloadURL");
    let build_key = opt_str(&data, "buildKey");
    Ok(RemoteUpdate {
        has_new_version: data
            .get("buildHaveNewVersion")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        version: opt_str(&data, "buildVersion"),
        version_code: mapper::parse_version_code(&opt_str(&data, "buildVersionNo")),
        description: opt_str(&data, "buildUpdateDescription"),
        download_url: mapper::resolve_download_url(&download_url, &build_key, api_key),
        force_update: data
            .get("needForceUpdate")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        md5: opt_str(&data, "buildMd5"),
        sha256: opt_str(&data, "buildSha256"),
        size_bytes: mapper::parse_file_size(
            data.get("buildFileSize")
                .unwrap_or(&serde_json::Value::Null),
        ),
    })
}

fn opt_str(data: &serde_json::Value, key: &str) -> String {
    data.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn platform() -> PlatformInfo {
        PlatformInfo {
            version: "0.1.0".into(),
            identifier: "com.yohu.adbtools".into(),
            os: "windows".into(),
            arch: "x86_64".into(),
        }
    }

    #[test]
    fn check_form_sends_platform_version() {
        let creds = PgyerCredentials::new("k", "app").unwrap();
        let body = check_form(&platform(), &creds);
        assert!(body.contains("_api_key=k"));
        assert!(body.contains("appKey=app"));
        assert!(body.contains("buildVersion=0.1.0"));
        assert!(!body.contains("com.yohu.adbtools"));
    }

    #[test]
    fn parse_check_body_maps_pgyer_fields() {
        let body = r#"{
            "code": 0,
            "message": "",
            "data": {
                "buildHaveNewVersion": true,
                "buildVersion": "1.2.0",
                "buildVersionNo": "12",
                "buildUpdateDescription": "fix",
                "downloadURL": "https://www.pgyer.com/abcd",
                "buildKey": "abc",
                "needForceUpdate": false,
                "buildMd5": "m",
                "buildSha256": "s",
                "buildFileSize": "100"
            }
        }"#;
        let update = parse_check_body(body, "test-api-key").unwrap();
        assert!(update.has_new_version);
        assert_eq!(update.version, "1.2.0");
        assert_eq!(update.version_code, 12);
        assert_eq!(update.description, "fix");
        assert!(update.download_url.contains("/apiv2/app/install"));
        assert!(update.download_url.contains("buildKey=abc"));
        assert_eq!(update.md5, "m");
        assert_eq!(update.size_bytes, 100);
    }

    #[test]
    fn parse_check_body_platform_error() {
        let err = parse_check_body(r#"{"code":1,"message":"appKey error"}"#, "k").unwrap_err();
        assert!(matches!(err, UpdateError::Platform(m) if m == "appKey error"));
    }

    #[test]
    fn empty_credentials_rejected() {
        assert!(matches!(
            PgyerCredentials::new(" ", "app"),
            Err(UpdateError::NotConfigured)
        ));
    }
}
