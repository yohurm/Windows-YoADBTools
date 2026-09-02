//! 设置键校验与应用（贴 protocol 模型；落盘与副作用仍在壳）。

use yohu_protocol::{AppSettings, MirrorProtocol, SettingKey};

use crate::mirror::apply_protocol;

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

/// 把单键 JSON 写入快照。不落盘、不触发 sidecar / 采集副作用。
pub fn apply_setting(
    settings: &mut AppSettings,
    key: SettingKey,
    value: &serde_json::Value,
) -> Result<(), String> {
    match key {
        SettingKey::AdbPath => {
            settings.adb_path = must_str(key, value)?;
        }
        SettingKey::DataRoot => {
            settings.data_root = must_str(key, value)?;
        }
        SettingKey::DevicesAutoRefresh => {
            let n = must_u64(key, value)?;
            settings.devices_auto_refresh = u32::try_from(n).map_err(|_| "数值过大")?;
        }
        SettingKey::BufferCapacity => {
            let n = must_u64(key, value)?;
            if n == 0 {
                return Err(format!("{} 必须大于 0", key.as_str()));
            }
            settings.buffer_capacity = n as usize;
        }
        SettingKey::ClearDeviceOnStart => {
            settings.clear_device_on_start = must_bool(key, value)?;
        }
        SettingKey::Theme => {
            settings.theme = serde_json::from_value(value.clone())
                .map_err(|_| format!("{} 必须是 light、dark 或 system", key.as_str()))?;
        }
        SettingKey::Density => {
            settings.density = serde_json::from_value(value.clone())
                .map_err(|_| format!("{} 必须是 compact 或 comfortable", key.as_str()))?;
        }
        SettingKey::ExportDefaultPath => {
            settings.export_default_path = must_str(key, value)?;
        }
        SettingKey::ExportAskEveryTime => {
            settings.export_ask_every_time = must_bool(key, value)?;
        }
        SettingKey::ExportMode => {
            settings.export_mode = serde_json::from_value(value.clone())
                .map_err(|_| format!("{} 必须是 latest 或 select", key.as_str()))?;
        }
        SettingKey::LogWriteMode => {
            settings.log_write_mode = serde_json::from_value(value.clone())
                .map_err(|_| format!("{} 必须是 overwrite 或 append", key.as_str()))?;
        }
        SettingKey::LogDisplayColumns => {
            settings.log_display_columns = serde_json::from_value(value.clone()).map_err(|_| {
                format!(
                    "{} 必须是列开关对象（ts/uid/pid/tid/level/tag）",
                    key.as_str()
                )
            })?;
        }
        SettingKey::MirrorMaxSize => {
            let n = must_u64(key, value)?;
            settings.mirror_max_size = u32::try_from(n).map_err(|_| "数值过大")?;
        }
        SettingKey::MirrorVideoBitRate => {
            let n = must_u64(key, value)?;
            if n == 0 {
                return Err(format!("{} 必须大于 0", key.as_str()));
            }
            settings.mirror_video_bit_rate = u32::try_from(n).map_err(|_| "数值过大")?;
        }
        SettingKey::MirrorMaxFps => {
            let n = must_u64(key, value)?;
            settings.mirror_max_fps = u32::try_from(n).map_err(|_| "数值过大")?;
        }
        SettingKey::MirrorProtocol => {
            let protocol: MirrorProtocol = serde_json::from_value(value.clone())
                .map_err(|_| format!("{} 必须是 usb 或 wifi", key.as_str()))?;
            apply_protocol(settings, protocol);
        }
        SettingKey::MirrorForceForward => {
            settings.mirror_force_forward = must_bool(key, value)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn buffer_capacity_rejects_zero() {
        let mut s = AppSettings::default();
        let err = apply_setting(&mut s, SettingKey::BufferCapacity, &json!(0)).unwrap_err();
        assert!(err.contains("必须大于 0"));
    }

    #[test]
    fn theme_and_density_apply() {
        let mut s = AppSettings::default();
        apply_setting(&mut s, SettingKey::Theme, &json!("dark")).unwrap();
        apply_setting(&mut s, SettingKey::Density, &json!("compact")).unwrap();
        assert_eq!(s.theme, yohu_protocol::Theme::Dark);
        assert_eq!(s.density, yohu_protocol::Density::Compact);
    }

    #[test]
    fn mirror_protocol_fills_encode_params_without_inventing_custom() {
        let mut s = AppSettings::default();
        apply_setting(&mut s, SettingKey::MirrorProtocol, &json!("wifi")).unwrap();
        assert_eq!(s.mirror_max_size, 1024);
        assert_eq!(s.mirror_video_bit_rate, 2_000_000);
        assert_eq!(s.mirror_max_fps, 30);
        assert_eq!(s.mirror_protocol, yohu_protocol::MirrorProtocol::Wifi);
        apply_setting(&mut s, SettingKey::MirrorMaxFps, &json!(15)).unwrap();
        assert_eq!(s.mirror_max_fps, 15);
        assert_eq!(s.mirror_protocol, yohu_protocol::MirrorProtocol::Wifi);
    }
}
