//! 应用设置模型（键表见需求文档 §4.5）。

use serde::{Deserialize, Serialize};

/// 主题（默认跟随系统，P7）。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    #[default]
    System,
}

/// 界面密度（UI设计系统-v6.md §2.3；立即生效）。新安装默认 Comfortable（鸿蒙 PC）。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Density {
    Compact,
    #[default]
    Comfortable,
}

/// 日志导出写入方式。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportWriteMode {
    #[default]
    Overwrite,
    Append,
}

fn default_true() -> bool {
    true
}

/// 日志清单显示哪些元数据列（消息列始终显示）。缺字段视为开启。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LogDisplayColumns {
    #[serde(default = "default_true")]
    pub ts: bool,
    #[serde(default = "default_true")]
    pub uid: bool,
    #[serde(default = "default_true")]
    pub pid: bool,
    #[serde(default = "default_true")]
    pub tid: bool,
    #[serde(default = "default_true")]
    pub level: bool,
    #[serde(default = "default_true")]
    pub tag: bool,
}

impl Default for LogDisplayColumns {
    fn default() -> Self {
        Self {
            ts: true,
            uid: true,
            pid: true,
            tid: true,
            level: true,
            tag: true,
        }
    }
}

/// 全部设置项（JSON 文件全量序列化；字段级缺省回落到 [`AppSettings::default`]）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AppSettings {
    /// 自定义 adb 路径；空 = 自动解析（用户设置 → 应用旁 → 内置解压）
    #[serde(default)]
    pub adb_path: String,
    /// 数据目录；空 = 默认 `%LOCALAPPDATA%\<DATA_DIR_NAME>\data`（重启生效）
    #[serde(default)]
    pub data_root: String,
    /// 设备自动刷新间隔（秒），0 = 关
    #[serde(default)]
    pub devices_auto_refresh: u32,
    /// 设备共享环形缓冲行数（core 环 + UI 镜像 + 可见区同一上限；采集环下次启动生效）
    #[serde(default = "default_buffer_capacity")]
    pub buffer_capacity: usize,
    /// 开始采集前执行 `adb logcat -c`
    #[serde(default = "default_clear_device")]
    pub clear_device_on_start: bool,
    #[serde(default)]
    pub theme: Theme,
    /// 界面密度（compact/comfortable；立即生效）
    #[serde(default)]
    pub density: Density,
    /// 日志导出默认目录；空 = 应用 exports 目录
    #[serde(default)]
    pub export_default_path: String,
    /// 每次导出弹出保存对话框
    #[serde(default = "default_export_ask")]
    pub export_ask_every_time: bool,
    /// 覆盖或续写
    #[serde(default)]
    pub export_write_mode: ExportWriteMode,
    /// 日志清单显示列（立即生效；消息列始终在）
    #[serde(default)]
    pub log_display_columns: LogDisplayColumns,
}

fn default_buffer_capacity() -> usize {
    10_000
}
fn default_clear_device() -> bool {
    true
}
fn default_export_ask() -> bool {
    true
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            adb_path: String::new(),
            data_root: String::new(),
            devices_auto_refresh: 0,
            buffer_capacity: default_buffer_capacity(),
            clear_device_on_start: default_clear_device(),
            theme: Theme::System,
            density: Density::Comfortable,
            export_default_path: String::new(),
            export_ask_every_time: default_export_ask(),
            export_write_mode: ExportWriteMode::Overwrite,
            log_display_columns: LogDisplayColumns::default(),
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
    ClearDeviceOnStart,
    Theme,
    Density,
    ExportDefaultPath,
    ExportAskEveryTime,
    ExportWriteMode,
    LogDisplayColumns,
}

impl SettingKey {
    /// 与 serde `snake_case` 相同的键名（`settings.get/set` 与 `settings.changed` 共用）。
    pub fn as_str(&self) -> &'static str {
        match self {
            SettingKey::AdbPath => "adb_path",
            SettingKey::DataRoot => "data_root",
            SettingKey::DevicesAutoRefresh => "devices_auto_refresh",
            SettingKey::BufferCapacity => "buffer_capacity",
            SettingKey::ClearDeviceOnStart => "clear_device_on_start",
            SettingKey::Theme => "theme",
            SettingKey::Density => "density",
            SettingKey::ExportDefaultPath => "export_default_path",
            SettingKey::ExportAskEveryTime => "export_ask_every_time",
            SettingKey::ExportWriteMode => "export_write_mode",
            SettingKey::LogDisplayColumns => "log_display_columns",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_comfortable_system_and_sane() {
        let s = AppSettings::default();
        assert_eq!(s.theme, Theme::System);
        assert_eq!(s.density, Density::Comfortable);
        assert_eq!(s.buffer_capacity, 10_000);
        assert!(s.clear_device_on_start);
        assert!(s.export_ask_every_time);
        assert_eq!(s.export_write_mode, ExportWriteMode::Overwrite);
        assert!(s.export_default_path.is_empty());
        assert_eq!(s.log_display_columns, LogDisplayColumns::default());
    }

    #[test]
    fn missing_density_uses_comfortable_default() {
        let json = r#"{
            "adb_path": "",
            "data_root": "",
            "devices_auto_refresh": 0,
            "buffer_capacity": 50000,
            "display_limit": 2000,
            "clear_device_on_start": true,
            "theme": "dark"
        }"#;
        let s: AppSettings = serde_json::from_str(json).expect("未知字段应忽略");
        assert_eq!(s.theme, Theme::Dark);
        assert_eq!(s.density, Density::Comfortable);
        assert!(s.export_ask_every_time);
        assert_eq!(s.export_write_mode, ExportWriteMode::Overwrite);
    }

    #[test]
    fn setting_keys_serialize_to_wire_names() {
        use serde_json::json;
        assert_eq!(
            serde_json::to_value(SettingKey::AdbPath).unwrap(),
            json!("adb_path")
        );
        assert_eq!(
            serde_json::to_value(SettingKey::DevicesAutoRefresh).unwrap(),
            json!("devices_auto_refresh")
        );
        assert_eq!(
            serde_json::to_value(SettingKey::ClearDeviceOnStart).unwrap(),
            json!("clear_device_on_start")
        );
        assert_eq!(
            serde_json::to_value(SettingKey::Theme).unwrap(),
            json!("theme")
        );
        assert_eq!(
            serde_json::to_value(SettingKey::Density).unwrap(),
            json!("density")
        );
        assert_eq!(
            serde_json::to_value(SettingKey::LogDisplayColumns).unwrap(),
            json!("log_display_columns")
        );
        assert_eq!(SettingKey::BufferCapacity.as_str(), "buffer_capacity");
        assert_eq!(
            SettingKey::LogDisplayColumns.as_str(),
            "log_display_columns"
        );
        assert_eq!(
            SettingKey::BufferCapacity.as_str(),
            serde_json::to_value(SettingKey::BufferCapacity)
                .unwrap()
                .as_str()
                .unwrap()
        );
    }

    #[test]
    fn density_serializes_lowercase() {
        assert_eq!(
            serde_json::to_value(Density::Compact).unwrap(),
            serde_json::json!("compact")
        );
        assert_eq!(
            serde_json::to_value(Density::Comfortable).unwrap(),
            serde_json::json!("comfortable")
        );
    }

    #[test]
    fn theme_serializes_lowercase_including_system() {
        assert_eq!(
            serde_json::to_value(Theme::Light).unwrap(),
            serde_json::json!("light")
        );
        assert_eq!(
            serde_json::to_value(Theme::Dark).unwrap(),
            serde_json::json!("dark")
        );
        assert_eq!(
            serde_json::to_value(Theme::System).unwrap(),
            serde_json::json!("system")
        );
    }

    #[test]
    fn missing_theme_field_deserializes_to_system() {
        let json = r#"{
            "adb_path": "",
            "data_root": "",
            "devices_auto_refresh": 0,
            "buffer_capacity": 10000,
            "clear_device_on_start": true
        }"#;
        let s: AppSettings = serde_json::from_str(json).expect("缺 theme 应回落默认");
        assert_eq!(s.theme, Theme::System);
        assert_eq!(s.log_display_columns, LogDisplayColumns::default());
    }

    #[test]
    fn partial_log_display_columns_defaults_missing_flags_true() {
        let s: LogDisplayColumns =
            serde_json::from_str(r#"{"uid":false,"tag":false}"#).expect("部分列开关");
        assert!(s.ts && s.pid && s.tid && s.level);
        assert!(!s.uid && !s.tag);
    }
}
