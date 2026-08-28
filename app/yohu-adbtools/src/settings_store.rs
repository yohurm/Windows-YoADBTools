//! 设置存储：JSON + 原子写（临时文件 + rename）。校验在 yohu-domain。

use std::path::PathBuf;
use std::sync::RwLock;

use yohu_domain::apply_setting;
use yohu_protocol::{AppSettings, SettingKey};
use yohu_runtime::{atomic_write, backup_corrupt};

/// 文件设置存储。
pub struct SettingsStore {
    file: PathBuf,
    inner: RwLock<AppSettings>,
}

impl SettingsStore {
    /// 读取（缺失 → 默认值；损坏 → 备份 `.corrupt-<ts>` 后回落默认，不中断启动）。
    pub fn load(file: PathBuf) -> Self {
        let settings = match std::fs::read_to_string(&file) {
            Ok(text) => match serde_json::from_str::<AppSettings>(&text) {
                Ok(s) => s,
                Err(_) => {
                    // 与其他用户数据（library_store）一致：损坏文件先备份再重建，避免静默覆盖。
                    let _ = backup_corrupt(&file, &text);
                    AppSettings::default()
                }
            },
            Err(_) => AppSettings::default(), // 缺失 → 默认
        };
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
        apply_setting(&mut s, key, value)?;
        *self.inner.write().expect("settings lock poisoned") = s.clone();
        self.save_atomic()?;
        Ok(s)
    }

    /// 原子写：临时文件 + rename（Windows rename 覆盖语义由 std 保证）。
    pub fn save_atomic(&self) -> Result<(), String> {
        let snapshot = self.snapshot();
        let text = serde_json::to_string_pretty(&snapshot).map_err(|e| e.to_string())?;
        atomic_write(&self.file, text).map_err(|e| e.to_string())
    }
}
