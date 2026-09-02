//! 设备焦点与模块选择作用域语义。
//!
//! 设备**目录**在 core（`last_devices`）；**选择会话**在壳（焦点 + 每模块勾选）。
//! 执行目标由 [`SelectionMode::resolve_targets`] 解析（禁止默认广播全部在线设备），
//! 命令边界再用 [`assert_device_online`] 校验——与路径 [`crate::SafetyRoot`] 同级，不信任 UI。

use yohu_protocol::{DeviceInfo, DeviceState};

/// 模块对设备的选择模式。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SelectionMode {
    /// 不消费设备（如设置）
    None,
    /// 单设备必选（跟随全局焦点；文件 / 日志新窗口）
    SingleRequired,
    /// 多设备可选（终端并行；勾选 ∩ 在线，空则回退焦点）
    MultiOptional,
}

impl SelectionMode {
    /// 解析当前模块的执行目标 serials（仅在线设备；保序去重）。
    ///
    /// | 模式 | 目标 |
    /// |------|------|
    /// | `None` | 空 |
    /// | `SingleRequired` | 焦点（若在线） |
    /// | `MultiOptional` | `selected ∩ online`；若空则回退焦点（若在线） |
    pub fn resolve_targets(
        self,
        focus: Option<&str>,
        selected: &[String],
        online: &[String],
    ) -> Vec<String> {
        let is_online = |serial: &str| online.iter().any(|s| s == serial);
        match self {
            Self::None => Vec::new(),
            Self::SingleRequired => focus
                .filter(|serial| is_online(serial))
                .map(|serial| vec![serial.to_string()])
                .unwrap_or_default(),
            Self::MultiOptional => {
                let mut targets = Vec::new();
                for serial in selected {
                    if is_online(serial) && !targets.iter().any(|s| s == serial) {
                        targets.push(serial.clone());
                    }
                }
                if targets.is_empty() {
                    if let Some(serial) = focus.filter(|s| is_online(s)) {
                        targets.push(serial.to_string());
                    }
                }
                targets
            }
        }
    }
}

/// 命令边界：目标设备必须出现在最近一次扫描且状态为在线。
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum DeviceSessionError {
    #[error("未选择在线设备")]
    Empty,
    #[error("未知设备: {0}")]
    Unknown(String),
    #[error("设备未授权: {0}")]
    Unauthorized(String),
    #[error("设备未在线: {0}")]
    Offline(String),
}

/// 校验单台设备当前在线（不信任调用方传入的 serial）。
pub fn assert_device_online(
    serial: &str,
    devices: &[DeviceInfo],
) -> Result<(), DeviceSessionError> {
    match devices.iter().find(|d| d.serial == serial) {
        Some(d) if d.state == DeviceState::Online => Ok(()),
        Some(d) if d.state == DeviceState::Unauthorized => {
            Err(DeviceSessionError::Unauthorized(serial.to_string()))
        }
        Some(_) => Err(DeviceSessionError::Offline(serial.to_string())),
        None => Err(DeviceSessionError::Unknown(serial.to_string())),
    }
}

/// 校验一组执行目标：非空且每一台都在线。
pub fn assert_targets_online(
    serials: &[String],
    devices: &[DeviceInfo],
) -> Result<(), DeviceSessionError> {
    if serials.is_empty() {
        return Err(DeviceSessionError::Empty);
    }
    for serial in serials {
        assert_device_online(serial, devices)?;
    }
    Ok(())
}

/// 人读设备名：型号去空白后非空则用之，否则 serial。
/// 设备栏 / 页眉 / 选择器同一规则；禁止 UI 再写 `model ?? serial`。
pub fn device_display_name(device: &DeviceInfo) -> &str {
    match device.model.as_deref() {
        Some(model) => {
            let name = model.trim();
            if name.is_empty() {
                device.serial.as_str()
            } else {
                name
            }
        }
        None => device.serial.as_str(),
    }
}

/// 按 serials 顺序从目录取出设备（缺条跳过，保序）。
/// 壳注入 `DeviceSession.selectedDevices` 与页眉同一切片。
pub fn lookup_selected_devices<'a>(
    serials: &[String],
    catalog: &'a [DeviceInfo],
) -> Vec<&'a DeviceInfo> {
    serials
        .iter()
        .filter_map(|serial| catalog.iter().find(|d| d.serial == *serial))
        .collect()
}

/// 一次成功的 `adb devices -l` 就是设备目录。
/// 空列表 = 当前没有设备；禁止用上次快照顶替（那会让已拔线的设备继续显示在线）。
/// 返回 (新目录, 先前在线且本次名单里没有的 serial)。
pub fn catalog_after_scan(
    previous: &[DeviceInfo],
    scanned: Vec<DeviceInfo>,
) -> (Vec<DeviceInfo>, Vec<String>) {
    let present: std::collections::HashSet<&str> =
        scanned.iter().map(|d| d.serial.as_str()).collect();
    let went_offline = previous
        .iter()
        .filter(|d| d.state == DeviceState::Online && !present.contains(d.serial.as_str()))
        .map(|d| d.serial.clone())
        .collect();
    (scanned, went_offline)
}

/// 目录刷新后的焦点收敛：仍在线则保持，否则落到第一台在线设备。
pub fn reconcile_focus(focus: Option<&str>, online: &[String]) -> Option<String> {
    if let Some(serial) = focus.filter(|s| online.iter().any(|o| o == s)) {
        return Some(serial.to_string());
    }
    online.first().cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reconcile_focus_keeps_online_focus() {
        let online = vec!["A1".into(), "B2".into()];
        assert_eq!(reconcile_focus(Some("B2"), &online).as_deref(), Some("B2"));
    }

    #[test]
    fn reconcile_focus_falls_back_to_first_online() {
        let online = vec!["A1".into(), "B2".into()];
        assert_eq!(reconcile_focus(Some("C3"), &online).as_deref(), Some("A1"));
        assert_eq!(reconcile_focus(None, &online).as_deref(), Some("A1"));
        assert!(reconcile_focus(Some("A1"), &[]).is_none());
    }

    #[test]
    fn reconcile_focus_matches_shared_fixture() {
        #[derive(serde::Deserialize)]
        struct Case {
            focus: Option<String>,
            online: Vec<String>,
            expect: Option<String>,
        }
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../testdata/reconcile_focus.json"))
                .expect("fixture");
        for case in cases {
            assert_eq!(
                reconcile_focus(case.focus.as_deref(), &case.online),
                case.expect,
                "focus={:?}",
                case.focus
            );
        }
    }

    #[test]
    fn none_never_targets_devices() {
        let online = vec!["A1".into(), "B2".into()];
        assert!(SelectionMode::None
            .resolve_targets(Some("A1"), &["A1".into(), "B2".into()], &online)
            .is_empty());
    }

    #[test]
    fn single_required_follows_online_focus_only() {
        let online = vec!["A1".into(), "B2".into()];
        assert_eq!(
            SelectionMode::SingleRequired.resolve_targets(Some("B2"), &["A1".into()], &online),
            vec!["B2".to_string()]
        );
        assert!(SelectionMode::SingleRequired
            .resolve_targets(Some("C3"), &[], &online)
            .is_empty());
    }

    #[test]
    fn multi_optional_empty_selection_falls_back_to_focus_not_all_online() {
        let online = vec!["A1".into(), "B2".into()];
        assert_eq!(
            SelectionMode::MultiOptional.resolve_targets(Some("A1"), &[], &online),
            vec!["A1".to_string()],
            "未勾选时只打焦点，禁止广播全部在线设备"
        );
    }

    #[test]
    fn multi_optional_uses_selected_intersection() {
        let online = vec!["A1".into(), "B2".into()];
        assert_eq!(
            SelectionMode::MultiOptional.resolve_targets(
                Some("A1"),
                &["B2".into(), "offline".into()],
                &online
            ),
            vec!["B2".to_string()]
        );
    }

    #[test]
    fn multi_optional_offline_selection_falls_back_to_focus() {
        let online = vec!["A1".into()];
        assert_eq!(
            SelectionMode::MultiOptional.resolve_targets(Some("A1"), &["B2".into()], &online),
            vec!["A1".to_string()]
        );
    }

    #[test]
    fn resolve_targets_matches_shared_fixture() {
        #[derive(serde::Deserialize)]
        struct Case {
            mode: String,
            focus: Option<String>,
            selected: Vec<String>,
            online: Vec<String>,
            expect: Vec<String>,
        }
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../testdata/resolve_targets.json"))
                .expect("fixture");
        for case in cases {
            let mode = match case.mode.as_str() {
                "none" => SelectionMode::None,
                "singleRequired" => SelectionMode::SingleRequired,
                "multiOptional" => SelectionMode::MultiOptional,
                other => panic!("unknown mode {other}"),
            };
            assert_eq!(
                mode.resolve_targets(case.focus.as_deref(), &case.selected, &case.online),
                case.expect,
                "mode={}",
                case.mode
            );
        }
    }

    fn device(serial: &str, state: DeviceState) -> DeviceInfo {
        DeviceInfo {
            serial: serial.into(),
            model: None,
            state,
            connection: "usb".into(),
        }
    }

    #[test]
    fn assert_device_online_rejects_unknown_unauthorized_offline() {
        let devices = vec![
            device("A1", DeviceState::Online),
            device("B2", DeviceState::Unauthorized),
            device("C3", DeviceState::Offline),
        ];
        assert!(assert_device_online("A1", &devices).is_ok());
        assert!(matches!(
            assert_device_online("B2", &devices),
            Err(DeviceSessionError::Unauthorized(_))
        ));
        assert!(matches!(
            assert_device_online("C3", &devices),
            Err(DeviceSessionError::Offline(_))
        ));
        assert!(matches!(
            assert_device_online("Z9", &devices),
            Err(DeviceSessionError::Unknown(_))
        ));
        assert_eq!(
            assert_targets_online(&[], &devices),
            Err(DeviceSessionError::Empty)
        );
    }

    fn device_with_model(serial: &str, model: Option<&str>) -> DeviceInfo {
        DeviceInfo {
            serial: serial.into(),
            model: model.map(str::to_string),
            state: DeviceState::Online,
            connection: "usb".into(),
        }
    }

    #[test]
    fn device_display_name_matches_shared_fixture() {
        #[derive(serde::Deserialize)]
        struct Case {
            serial: String,
            model: Option<String>,
            expect: String,
        }
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../testdata/device_display_name.json"))
                .expect("fixture");
        for case in cases {
            let device = device_with_model(&case.serial, case.model.as_deref());
            assert_eq!(
                device_display_name(&device),
                case.expect,
                "serial={}",
                case.serial
            );
        }
    }

    #[test]
    fn lookup_selected_devices_matches_shared_fixture() {
        #[derive(serde::Deserialize)]
        struct Case {
            serials: Vec<String>,
            catalog: Vec<DeviceInfo>,
            expect: Vec<String>,
        }
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../testdata/lookup_selected_devices.json"))
                .expect("fixture");
        for case in cases {
            let found: Vec<&str> = lookup_selected_devices(&case.serials, &case.catalog)
                .iter()
                .map(|d| d.serial.as_str())
                .collect();
            assert_eq!(found, case.expect, "serials={:?}", case.serials);
        }
    }

    #[test]
    fn catalog_after_scan_empty_replaces_previous_online() {
        let previous = vec![device("A1", DeviceState::Online)];
        let (next, went_offline) = catalog_after_scan(&previous, Vec::new());
        assert!(next.is_empty());
        assert_eq!(went_offline, vec!["A1".to_string()]);
    }

    #[test]
    fn catalog_after_scan_keeps_present_online() {
        let previous = vec![device("A1", DeviceState::Online)];
        let scanned = vec![device("A1", DeviceState::Online)];
        let (next, went_offline) = catalog_after_scan(&previous, scanned);
        assert_eq!(next.len(), 1);
        assert!(went_offline.is_empty());
    }

    #[test]
    fn catalog_after_scan_offline_when_serial_missing() {
        let previous = vec![
            device("A1", DeviceState::Online),
            device("B2", DeviceState::Unauthorized),
        ];
        let scanned = vec![device("B2", DeviceState::Unauthorized)];
        let (next, went_offline) = catalog_after_scan(&previous, scanned);
        assert_eq!(next[0].serial, "B2");
        assert_eq!(went_offline, vec!["A1".to_string()]);
    }
}
