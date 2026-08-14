//! 设备路径安全（ADR-v6-013）：规范化 + 安全根校验。
//!
//! 删除/新建目录等危险操作由 **core 侧强制校验**，不信任 UI 传来的路径。

/// 路径错误。
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum PathError {
    #[error("路径必须是绝对路径: {0}")]
    NotAbsolute(String),
    #[error("路径含 .. 穿越: {0}")]
    Traversal(String),
}

/// 规范化后的设备绝对路径（拒绝 `..` 与相对路径）。
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct RemotePath {
    normalized: String,
}

impl RemotePath {
    /// 解析并规范化：反斜杠转斜杠、折叠 `.` 与空段、拒绝 `..`、必须绝对路径。
    pub fn parse(raw: &str) -> Result<Self, PathError> {
        let replaced = raw.replace('\\', "/");
        if !replaced.starts_with('/') {
            return Err(PathError::NotAbsolute(raw.to_string()));
        }
        let mut parts: Vec<&str> = Vec::new();
        for seg in replaced.split('/') {
            match seg {
                "" | "." => continue,
                ".." => return Err(PathError::Traversal(raw.to_string())),
                s => parts.push(s),
            }
        }
        Ok(Self { normalized: format!("/{}", parts.join("/")) })
    }

    pub fn as_str(&self) -> &str {
        &self.normalized
    }

    /// 本路径是否等于 `root` 或位于其子路径。
    pub fn is_under(&self, root: &RemotePath) -> bool {
        self.normalized == root.normalized
            || self.normalized.starts_with(&format!("{}/", root.normalized))
    }
}

/// 安全根违反。
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SafetyError {
    #[error("路径不在安全根内: {0}")]
    OutsideRoot(String),
}

/// 安全根集合（默认 `/sdcard`、`/storage`）。
#[derive(Debug, Clone)]
pub struct SafetyRoot {
    roots: Vec<RemotePath>,
}

impl Default for SafetyRoot {
    fn default() -> Self {
        Self::new(&["/sdcard", "/storage"]).expect("内置安全根恒有效")
    }
}

impl SafetyRoot {
    pub fn new(roots: &[&str]) -> Result<Self, PathError> {
        let parsed = roots
            .iter()
            .map(|r| RemotePath::parse(r))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self { roots: parsed })
    }

    /// 校验危险操作路径；通过返回规范化路径供执行使用。
    pub fn check(&self, raw: &str) -> Result<RemotePath, SafetyError> {
        let path = RemotePath::parse(raw).map_err(|e| SafetyError::OutsideRoot(e.to_string()))?;
        if self.roots.iter().any(|r| path.is_under(r)) {
            Ok(path)
        } else {
            Err(SafetyError::OutsideRoot(path.as_str().to_string()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_normalizes() {
        let p = RemotePath::parse("/sdcard//a/./b/").unwrap();
        assert_eq!(p.as_str(), "/sdcard/a/b");
        let p = RemotePath::parse(r"\sdcard\a\b").unwrap();
        assert_eq!(p.as_str(), "/sdcard/a/b");
    }

    #[test]
    fn parse_rejects_traversal_and_relative() {
        assert!(matches!(RemotePath::parse("sdcard/a"), Err(PathError::NotAbsolute(_))));
        assert!(matches!(RemotePath::parse("/sdcard/../etc"), Err(PathError::Traversal(_))));
        assert!(matches!(RemotePath::parse("/a/../../b"), Err(PathError::Traversal(_))));
    }

    #[test]
    fn is_under_semantics() {
        let root = RemotePath::parse("/sdcard").unwrap();
        assert!(RemotePath::parse("/sdcard").unwrap().is_under(&root));
        assert!(RemotePath::parse("/sdcard/DCIM/x.jpg").unwrap().is_under(&root));
        // 前缀防伪：/sdcardevil 不算
        assert!(!RemotePath::parse("/sdcardevil").unwrap().is_under(&root));
    }

    #[test]
    fn safety_root_checks() {
        let safety = SafetyRoot::default();
        assert!(safety.check("/sdcard/DCIM/a.jpg").is_ok());
        assert!(safety.check("/storage/emulated/0/b").is_ok());
        assert!(matches!(safety.check("/data/local/tmp/x"), Err(SafetyError::OutsideRoot(_))));
        assert!(matches!(safety.check("/sdcard/../data/x"), Err(SafetyError::OutsideRoot(_))));
    }
}
