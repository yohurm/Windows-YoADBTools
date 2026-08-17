//! 设置存储：JSON + 原子写（临时文件 + rename）。

use std::path::PathBuf;
use std::sync::RwLock;

use yovo_protocol::{AppSettings, SettingKey};

/// 文件设置存储。
pub struct SettingsStore {
    file: PathBuf,
    inner: RwLock<AppSettings>,
}

impl SettingsStore {
    /// 读取（缺失/损坏 → 默认值，不中断启动）。
    pub fn load(file: PathBuf) -> Self {
        let settings = std::fs::read_to_string(&file)
            .ok()
            .and_then(|text| serde_json::from_str::<AppSettings>(&text).ok())
            .unwrap_or_default();
        Self { file, inner: RwLock::new(settings) }
    }

    pub fn snapshot(&self) -> AppSettings {
        self.inner.read().expect("settings lock poisoned").clone()
    }

    /// 更新单个键并原子落盘；返回更新后的全量快照。
    pub fn set(&self, key: SettingKey, value: &serde_json::Value) -> Result<AppSettings, String> {
        let mut s = self.snapshot();
        match key {
            SettingKey::AdbPath => {
                s.adb_path = value.as_str().ok_or("adb.path 必须是字符串")?.to_string();
            }
            SettingKey::DataRoot => {
                s.data_root = value.as_str().ok_or("data.root 必须是字符串")?.to_string();
            }
            SettingKey::DevicesAutoRefresh => {
                let n = value.as_u64().ok_or("devices.autoRefresh 必须是非负整数")?;
                s.devices_auto_refresh = u32::try_from(n).map_err(|_| "数值过大")?;
            }
            SettingKey::BufferCapacity => {
                let n = value.as_u64().ok_or("buffer.capacity 必须是非负整数")?;
                if n == 0 {
                    return Err("buffer.capacity 必须大于 0".into());
                }
                s.buffer_capacity = n as usize;
            }
            SettingKey::DisplayLimit => {
                let n = value.as_u64().ok_or("display.limit 必须是非负整数")?;
                if n == 0 {
                    return Err("display.limit 必须大于 0".into());
                }
                s.display_limit = n as usize;
            }
            SettingKey::ClearDeviceOnStart => {
                s.clear_device_on_start = value.as_bool().ok_or("clear.device.on.start 必须是布尔值")?;
            }
            SettingKey::Theme => {
                s.theme = match value.as_str() {
                    Some("light") => yovo_protocol::Theme::Light,
                    Some("dark") => yovo_protocol::Theme::Dark,
                    _ => return Err("theme 必须是 light 或 dark".into()),
                };
            }
            SettingKey::Density => {
                s.density = match value.as_str() {
                    Some("compact") => yovo_protocol::Density::Compact,
                    Some("comfortable") => yovo_protocol::Density::Comfortable,
                    _ => return Err("density 必须是 compact 或 comfortable".into()),
                };
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
