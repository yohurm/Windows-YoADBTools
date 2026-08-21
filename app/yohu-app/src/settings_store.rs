//! 设置存储：JSON + 原子写（临时文件 + rename）。

use std::path::PathBuf;
use std::sync::RwLock;

use yohu_protocol::{AppSettings, SettingKey};

/// 文件设置存储。
pub struct SettingsStore {
    file: PathBuf,
    inner: RwLock<AppSettings>,
}

fn must_str(key: SettingKey, value: &serde_json::Value) -> Result<String, String> {
    value
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| format!("{} 必须是字符串", key.as_str()))
}

fn must_u64(key: SettingKey, value: &serde_json::Value) -> Result<u64, String> {
    value
        .as_u64()
        .ok_or_else(|| format!("{} 必须是非负整数", key.as_str()))
}

fn must_bool(key: SettingKey, value: &serde_json::Value) -> Result<bool, String> {
    value
        .as_bool()
        .ok_or_else(|| format!("{} 必须是布尔值", key.as_str()))
}

impl SettingsStore {
    /// 读取（缺失/损坏 → 默认值，不中断启动）。
    pub fn load(file: PathBuf) -> Self {
        let settings = std::fs::read_to_string(&file)
            .ok()
            .and_then(|text| serde_json::from_str::<AppSettings>(&text).ok())
            .unwrap_or_default();
        Self {
            file,
            inner: RwLock::new(settings),
        }
    }

    pub fn snapshot(&self) -> AppSettings {
        self.inner.read().expect("settings lock poisoned").clone()
    }

    /// 更新单个键并原子落盘；返回更新后的全量快照。
    pub fn set(&self, key: SettingKey, value: &serde_json::Value) -> Result<AppSettings, String> {
        let mut s = self.snapshot();
        match key {
            SettingKey::AdbPath => {
                s.adb_path = must_str(key, value)?;
            }
            SettingKey::DataRoot => {
                s.data_root = must_str(key, value)?;
            }
            SettingKey::DevicesAutoRefresh => {
                let n = must_u64(key, value)?;
                s.devices_auto_refresh = u32::try_from(n).map_err(|_| "数值过大")?;
            }
            SettingKey::BufferCapacity => {
                let n = must_u64(key, value)?;
                if n == 0 {
                    return Err(format!("{} 必须大于 0", key.as_str()));
                }
                s.buffer_capacity = n as usize;
            }
            SettingKey::ClearDeviceOnStart => {
                s.clear_device_on_start = must_bool(key, value)?;
            }
            SettingKey::Theme => {
                s.theme = match value.as_str() {
                    Some("light") => yohu_protocol::Theme::Light,
                    Some("dark") => yohu_protocol::Theme::Dark,
                    Some("system") => yohu_protocol::Theme::System,
                    _ => return Err(format!("{} 必须是 light、dark 或 system", key.as_str())),
                };
            }
            SettingKey::Density => {
                s.density = match value.as_str() {
                    Some("compact") => yohu_protocol::Density::Compact,
                    Some("comfortable") => yohu_protocol::Density::Comfortable,
                    _ => return Err(format!("{} 必须是 compact 或 comfortable", key.as_str())),
                };
            }
            SettingKey::ExportDefaultPath => {
                s.export_default_path = must_str(key, value)?;
            }
            SettingKey::ExportAskEveryTime => {
                s.export_ask_every_time = must_bool(key, value)?;
            }
            SettingKey::ExportWriteMode => {
                s.export_write_mode = match value.as_str() {
                    Some("overwrite") => yohu_protocol::ExportWriteMode::Overwrite,
                    Some("append") => yohu_protocol::ExportWriteMode::Append,
                    _ => return Err(format!("{} 必须是 overwrite 或 append", key.as_str())),
                };
            }
            SettingKey::LogDisplayColumns => {
                s.log_display_columns = serde_json::from_value(value.clone()).map_err(|_| {
                    format!(
                        "{} 必须是列开关对象（ts/uid/pid/tid/level/tag）",
                        key.as_str()
                    )
                })?;
            }
        }
        *self.inner.write().expect("settings lock poisoned") = s.clone();
        self.save_atomic()?;
        Ok(s)
    }

    /// 原子写：临时文件 + rename（Windows rename 覆盖语义由 std 保证）。
    pub fn save_atomic(&self) -> Result<(), String> {
        if let Some(parent) = self.file.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let snapshot = self.snapshot();
        let text = serde_json::to_string_pretty(&snapshot).map_err(|e| e.to_string())?;
        let tmp = self.file.with_extension("tmp");
        std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &self.file).map_err(|e| e.to_string())?;
        Ok(())
    }
}
