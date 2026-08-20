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
pub fn assert_device_online(serial: &str, devices: &[DeviceInfo]) -> Result<(), DeviceSessionError> {
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
pub fn assert_targets_online(serials: &[String], devices: &[DeviceInfo]) -> Result<(), DeviceSessionError> {
    if serials.is_empty() {
        return Err(DeviceSessionError::Empty);
    }
    for serial in serials {
        assert_device_online(serial, devices)?;
    }
    Ok(())
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
            serde_json::from_str(include_str!("../testdata/reconcile_focus.json")).expect("fixture");
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
            serde_json::from_str(include_str!("../testdata/resolve_targets.json")).expect("fixture");
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
        assert_eq!(assert_targets_online(&[], &devices), Err(DeviceSessionError::Empty));
    }
}
