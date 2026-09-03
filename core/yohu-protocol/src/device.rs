//! 设备模型：目录条目（`adb devices -l`）与运行时状态快照。

use serde::{Deserialize, Serialize};

/// 设备连接状态。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DeviceState {
    /// 已授权，可用
    Online,
    /// 已连接但未授权（设备端弹窗）
    Unauthorized,
    /// 离线的连接条目
    Offline,
}

/// 一台设备（设备目录条目）。只描述存在性与连接，不含 dumpsys 属性。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub serial: String,
    /// 型号（`devices -l` 的 model: 字段，下划线转空格）；未知时为 None
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    pub state: DeviceState,
    /// 连接方式：`usb` / `usb:1-1` / `tcp:192.168.x.x:5555` / `unknown`
    pub connection: String,
}

/// 在线设备运行时状态（`DeviceStatusHub` 采样；字段缺省表示本次未解析到）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DeviceStatus {
    pub serial: String,
    /// 该 serial 上成功写入缓存的次数；内容未变不递增、不发事件
    pub generation: u64,
    /// 当前界面是否深色（解析后，不是 auto 偏好）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub night: Option<bool>,
    /// 电量 0–100
    #[serde(skip_serializing_if = "Option::is_none")]
    pub battery_pct: Option<u8>,
    /// 正在充电（AC/USB/无线任一）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub charging: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sdk: Option<u32>,
    /// `ro.build.version.release`
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release: Option<String>,
    /// 亮屏（Awake / Display ON）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub screen_on: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brand: Option<String>,
}

impl DeviceStatus {
    /// 运行时字段是否相同（忽略 generation）。
    pub fn same_runtime(&self, other: &Self) -> bool {
        self.serial == other.serial
            && self.night == other.night
            && self.battery_pct == other.battery_pct
            && self.charging == other.charging
            && self.sdk == other.sdk
            && self.release == other.release
            && self.screen_on == other.screen_on
            && self.brand == other.brand
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_json_snake_case_skips_none() {
        let status = DeviceStatus {
            serial: "ABC".into(),
            generation: 2,
            night: Some(true),
            battery_pct: Some(87),
            charging: Some(true),
            sdk: Some(34),
            release: Some("15".into()),
            screen_on: Some(true),
            brand: Some("motorola".into()),
        };
        assert_eq!(
            serde_json::to_value(&status).unwrap(),
            serde_json::json!({
                "serial": "ABC",
                "generation": 2,
                "night": true,
                "battery_pct": 87,
                "charging": true,
                "sdk": 34,
                "release": "15",
                "screen_on": true,
                "brand": "motorola",
            })
        );
        let sparse = DeviceStatus {
            serial: "ABC".into(),
            generation: 1,
            night: Some(false),
            battery_pct: None,
            charging: None,
            sdk: None,
            release: None,
            screen_on: None,
            brand: None,
        };
        assert_eq!(
            serde_json::to_value(&sparse).unwrap(),
            serde_json::json!({
                "serial": "ABC",
                "generation": 1,
                "night": false,
            })
        );
    }

    #[test]
    fn same_runtime_ignores_generation() {
        let a = DeviceStatus {
            serial: "S".into(),
            generation: 1,
            night: Some(true),
            battery_pct: None,
            charging: None,
            sdk: None,
            release: None,
            screen_on: None,
            brand: None,
        };
        let mut b = a.clone();
        b.generation = 9;
        assert!(a.same_runtime(&b));
        b.night = Some(false);
        assert!(!a.same_runtime(&b));
    }
}
