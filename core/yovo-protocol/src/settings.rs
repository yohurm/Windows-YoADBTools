//! 应用设置模型（键表见需求文档 §4.5）。

use serde::{Deserialize, Serialize};

/// 主题。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    Light,
    Dark,
}

/// 全部设置项（JSON 文件全量序列化；字段级缺省回落到 [`AppSettings::default`]）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AppSettings {
    /// 自定义 adb 路径；空 = 自动解析（用户设置 → 应用旁 → 内置解压）
    #[serde(default)]
    pub adb_path: String,
    /// 数据目录；空 = 默认 `%LOCALAPPDATA%\YovoAdbTools\data`（重启生效）
    #[serde(default)]
    pub data_root: String,
    /// 设备自动刷新间隔（秒），0 = 关
    #[serde(default)]
    pub devices_auto_refresh: u32,
    /// logcat 共享环形缓冲行数（下次采集生效）
    #[serde(default = "default_buffer_capacity")]
    pub buffer_capacity: usize,
    /// 每会话可见行上限
    #[serde(default = "default_display_limit")]
    pub display_limit: usize,
    /// 开始采集前执行 `adb logcat -c`
    #[serde(default = "default_clear_device")]
    pub clear_device_on_start: bool,
    #[serde(default)]
    pub theme: Theme,
}

fn default_buffer_capacity() -> usize {
    50_000
}
fn default_display_limit() -> usize {
    2_000
}
fn default_clear_device() -> bool {
    true
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            adb_path: String::new(),
            data_root: String::new(),
            devices_auto_refresh: 0,
            buffer_capacity: default_buffer_capacity(),
            display_limit: default_display_limit(),
            clear_device_on_start: default_clear_device(),
            theme: Theme::Light,
        }
    }
}

/// 设置键（`settings.get/set` 与 `settings.changed` 事件使用）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SettingKey {
    AdbPath,
    DataRoot,
    DevicesAutoRefresh,
    BufferCapacity,
    DisplayLimit,
    ClearDeviceOnStart,
    Theme,
}

impl SettingKey {
    /// 键名（事件负载与前端约定使用）。
    pub fn as_str(&self) -> &'static str {
        match self {
            SettingKey::AdbPath => "adb.path",
            SettingKey::DataRoot => "data.root",
            SettingKey::DevicesAutoRefresh => "devices.autoRefresh",
            SettingKey::BufferCapacity => "buffer.capacity",
            SettingKey::DisplayLimit => "display.limit",
            SettingKey::ClearDeviceOnStart => "clear.device.on.start",
            SettingKey::Theme => "theme",
        }
    }
}
