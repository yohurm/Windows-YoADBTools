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

/// 日志写入方式（实时逐窗口日志文件）。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogWriteMode {
    /// 每个窗口固定文件名，下次采集任务截断重写。
    #[default]
    Overwrite,
    /// 每个采集任务各开一个新文件（时间戳命名），旧文件保留。
    Append,
}

/// 手动导出行为（`log.export`）。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportMode {
    /// 直接导出当前窗口最新的日志文件。
    #[default]
    Latest,
    /// 弹窗列出窗口日志文件，多选（含全选/取消全选）后导出。
    Select,
}

/// 应用更新源（默认 GitHub；蒲公英可选）。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UpdateProvider {
    /// GitHub Releases。`gitcode` 是旧设置值，读入时当成 GitHub。
    #[default]
    #[serde(alias = "gitcode")]
    Github,
    Pgyer,
}

/// 日志清单显示哪些元数据列（消息列始终显示）。缺字段视为开启。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LogDisplayColumns {
    #[serde(default = "crate::default_true")]
    pub ts: bool,
    #[serde(default = "crate::default_true")]
    pub uid: bool,
    #[serde(default = "crate::default_true")]
    pub pid: bool,
    #[serde(default = "crate::default_true")]
    pub tid: bool,
    #[serde(default = "crate::default_true")]
    pub level: bool,
    #[serde(default = "crate::default_true")]
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
    /// 手动导出每次询问保存位置（默认开）
    #[serde(default = "default_export_ask")]
    pub export_ask_every_time: bool,
    /// 手动导出行为：最新 / 选择（导出实时逐窗口日志文件）
    #[serde(default)]
    pub export_mode: ExportMode,
    /// 日志写入方式（实时逐窗口文件）：覆盖 / 续写（每次任务新开文件）
    #[serde(default)]
    pub log_write_mode: LogWriteMode,
    /// 日志清单显示列（立即生效；消息列始终在）
    #[serde(default)]
    pub log_display_columns: LogDisplayColumns,
    /// 应用更新源（立即生效；默认 GitHub `yohurm/Windows-YoADBTools`）
    #[serde(default)]
    pub update_provider: UpdateProvider,
    /// 投屏长边上限（像素）；0 = 设备原始分辨率。下次启动生效。
    #[serde(default = "default_mirror_max_size")]
    pub mirror_max_size: u32,
    /// 投屏视频码率（bps）。下次启动生效。
    #[serde(default = "default_mirror_video_bit_rate")]
    pub mirror_video_bit_rate: u32,
    /// 投屏帧率上限；0 = 不限制。下次启动生效。
    #[serde(default = "default_mirror_max_fps")]
    pub mirror_max_fps: u32,
    /// 强制 ADB forward（跳过 reverse）。下次启动生效。
    #[serde(default)]
    pub mirror_force_forward: bool,
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

/// 投屏默认长边（与 scrcpy `-m` 同类；0 = 原始）。
pub fn default_mirror_max_size() -> u32 {
    1024
}

/// 投屏默认码率 2 Mbps（工作台内嵌，低于官方客户端 8 Mbps 默认）。
pub fn default_mirror_video_bit_rate() -> u32 {
    2_000_000
}

/// 投屏默认帧率上限。
pub fn default_mirror_max_fps() -> u32 {
    30
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
            export_mode: ExportMode::Latest,
            log_write_mode: LogWriteMode::Overwrite,
            log_display_columns: LogDisplayColumns::default(),
            update_provider: UpdateProvider::Github,
            mirror_max_size: default_mirror_max_size(),
            mirror_video_bit_rate: default_mirror_video_bit_rate(),
            mirror_max_fps: default_mirror_max_fps(),
            mirror_force_forward: false,
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
    ExportMode,
    LogWriteMode,
    LogDisplayColumns,
    UpdateProvider,
    MirrorMaxSize,
    MirrorVideoBitRate,
    MirrorMaxFps,
    MirrorForceForward,
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
            SettingKey::ExportMode => "export_mode",
            SettingKey::LogWriteMode => "log_write_mode",
            SettingKey::LogDisplayColumns => "log_display_columns",
            SettingKey::UpdateProvider => "update_provider",
            SettingKey::MirrorMaxSize => "mirror_max_size",
            SettingKey::MirrorVideoBitRate => "mirror_video_bit_rate",
            SettingKey::MirrorMaxFps => "mirror_max_fps",
            SettingKey::MirrorForceForward => "mirror_force_forward",
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
        assert_eq!(s.export_mode, ExportMode::Latest);
        assert_eq!(s.log_write_mode, LogWriteMode::Overwrite);
        assert!(s.export_default_path.is_empty());
        assert_eq!(s.log_display_columns, LogDisplayColumns::default());
        assert_eq!(s.update_provider, UpdateProvider::Github);
        assert_eq!(s.mirror_max_size, 1024);
        assert_eq!(s.mirror_video_bit_rate, 2_000_000);
        assert_eq!(s.mirror_max_fps, 30);
        assert!(!s.mirror_force_forward);
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../testdata/app_settings_default.json"))
                .expect("fixture");
        let serialized = serde_json::to_value(&s).expect("default json");
        assert_eq!(serialized, fixture);
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
        assert_eq!(s.export_mode, ExportMode::Latest);
        assert_eq!(s.log_write_mode, LogWriteMode::Overwrite);
        assert_eq!(s.update_provider, UpdateProvider::Github);
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
        assert_eq!(
            serde_json::to_value(SettingKey::UpdateProvider).unwrap(),
            json!("update_provider")
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
    fn all_setting_keys_as_str_match_serde_wire_names() {
        // 锁住 as_str 与 serde snake_case 键名一致，防止漂移（Nit #9）。
        let all = [
            SettingKey::AdbPath,
            SettingKey::DataRoot,
            SettingKey::DevicesAutoRefresh,
            SettingKey::BufferCapacity,
            SettingKey::ClearDeviceOnStart,
            SettingKey::Theme,
            SettingKey::Density,
            SettingKey::ExportDefaultPath,
            SettingKey::ExportAskEveryTime,
            SettingKey::ExportMode,
            SettingKey::LogWriteMode,
            SettingKey::LogDisplayColumns,
            SettingKey::UpdateProvider,
            SettingKey::MirrorMaxSize,
            SettingKey::MirrorVideoBitRate,
            SettingKey::MirrorMaxFps,
            SettingKey::MirrorForceForward,
        ];
        for key in all {
            let wire = serde_json::to_value(key).unwrap();
            assert_eq!(
                key.as_str(),
                wire.as_str().unwrap(),
                "SettingKey {:?} as_str 与 serde 键名不一致",
                key
            );
        }
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
    fn update_provider_serializes_lowercase() {
        assert_eq!(
            serde_json::to_value(UpdateProvider::Github).unwrap(),
            serde_json::json!("github")
        );
        assert_eq!(
            serde_json::to_value(UpdateProvider::Pgyer).unwrap(),
            serde_json::json!("pgyer")
        );
        assert_eq!(
            serde_json::from_value::<UpdateProvider>(serde_json::json!("gitcode")).unwrap(),
            UpdateProvider::Github
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
