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

/// 界面密度（UI设计系统-v6.md §2.3；立即生效）。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Density {
    #[default]
    Compact,
    Comfortable,
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
    /// 界面密度（compact/comfortable；立即生效）
    #[serde(default)]
    pub density: Density,
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
            density: Density::Compact,
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
    Density,
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
            SettingKey::Density => "density",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_compact_light_and_sane() {
        let s = AppSettings::default();
        assert_eq!(s.theme, Theme::Light);
        assert_eq!(s.density, Density::Compact);
        assert_eq!(s.buffer_capacity, 50_000);
        assert_eq!(s.display_limit, 2_000);
        assert!(s.clear_device_on_start);
    }

    #[test]
    fn legacy_file_without_density_deserializes_to_compact() {
        // 旧设置文件（无 density 字段）不得导致反序列化失败或行为漂移
        let json = r#"{
            "adb_path": "",
            "data_root": "",
            "devices_auto_refresh": 0,
            "buffer_capacity": 50000,
            "display_limit": 2000,
            "clear_device_on_start": true,
            "theme": "dark"
        }"#;
        let s: AppSettings = serde_json::from_str(json).expect("旧文件应可反序列化");
        assert_eq!(s.theme, Theme::Dark);
        assert_eq!(s.density, Density::Compact);
    }

    #[test]
    fn setting_keys_serialize_to_wire_names() {
        use serde_json::json;
        assert_eq!(serde_json::to_value(SettingKey::AdbPath).unwrap(), json!("adb_path"));
        assert_eq!(serde_json::to_value(SettingKey::DevicesAutoRefresh).unwrap(), json!("devices_auto_refresh"));
        assert_eq!(serde_json::to_value(SettingKey::ClearDeviceOnStart).unwrap(), json!("clear_device_on_start"));
        assert_eq!(serde_json::to_value(SettingKey::Theme).unwrap(), json!("theme"));
        assert_eq!(serde_json::to_value(SettingKey::Density).unwrap(), json!("density"));
    }

    #[test]
    fn density_serializes_lowercase() {
        assert_eq!(serde_json::to_value(Density::Compact).unwrap(), serde_json::json!("compact"));
        assert_eq!(serde_json::to_value(Density::Comfortable).unwrap(), serde_json::json!("comfortable"));
    }
}
