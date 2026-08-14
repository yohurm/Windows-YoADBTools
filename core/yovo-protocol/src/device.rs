//! 设备模型：`adb devices -l` 的解析结果。

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

/// 一台设备（设备目录条目）。
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
