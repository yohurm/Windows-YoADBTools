//! 设备焦点与模块选择作用域语义。

/// 模块对设备的选择模式。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SelectionMode {
    /// 不消费设备（如设置）
    None,
    /// 单设备必选（跟随全局焦点；文件/日志）
    SingleRequired,
    /// 多设备可选（终端并行）
    MultiOptional,
}

/// 全局设备焦点（设备目录与选择会话分离）。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DeviceFocus {
    /// 当前焦点设备 serial；None = 无设备
    pub active: Option<String>,
}

impl DeviceFocus {
    /// 焦点设备丢失（掉线/刷新后不存在）→ 清空并返回是否发生变化。
    pub fn resolve_against(&mut self, known_serials: &[String]) -> bool {
        match &self.active {
            Some(active) if known_serials.iter().any(|s| s == active) => false,
            Some(_) => {
                self.active = None;
                true
            }
            None => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn focus_kept_when_present() {
        let mut f = DeviceFocus { active: Some("s1".into()) };
        assert!(!f.resolve_against(&["s1".into(), "s2".into()]));
        assert_eq!(f.active.as_deref(), Some("s1"));
    }

    #[test]
    fn focus_cleared_when_lost() {
        let mut f = DeviceFocus { active: Some("s1".into()) };
        assert!(f.resolve_against(&["s2".into()]));
        assert!(f.active.is_none());
    }
}
