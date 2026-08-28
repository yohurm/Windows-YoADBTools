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
    #[error("条目名非法: {0}")]
    InvalidName(String),
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
        Ok(Self {
            normalized: format!("/{}", parts.join("/")),
        })
    }

    pub fn as_str(&self) -> &str {
        &self.normalized
    }

    /// 本路径是否等于 `root` 或位于其子路径。
    pub fn is_under(&self, root: &RemotePath) -> bool {
        self.normalized == root.normalized
            || self
                .normalized
                .starts_with(&format!("{}/", root.normalized))
    }

    /// 位于 `root` 之下（不含 root 本身）。`/sdcard/a` 是，`/sdcard` 不是。
    pub fn is_strictly_under(&self, root: &RemotePath) -> bool {
        self.normalized
            .starts_with(&format!("{}/", root.normalized))
    }

    /// 规范化路径的最后一段。`/` 为空串。
    pub fn file_name(&self) -> &str {
        self.normalized.rsplit('/').next().unwrap_or("")
    }
}

/// 校验单段条目名（禁止空、`.`/`..`、分隔符）。用于 UI 与 core 双侧。
pub fn validate_entry_name(name: &str) -> Result<(), PathError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(PathError::InvalidName("名称为空".into()));
    }
    if trimmed == "." || trimmed == ".." {
        return Err(PathError::InvalidName(trimmed.into()));
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains('\0') {
        return Err(PathError::InvalidName("含路径分隔符".into()));
    }
    Ok(())
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
        Self::new(yohu_protocol::safety_root::ALL).expect("内置安全根恒有效")
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

    /// 浏览范围：等于或位于安全根之下。
    pub fn check(&self, raw: &str) -> Result<RemotePath, SafetyError> {
        let path = RemotePath::parse(raw).map_err(|e| SafetyError::OutsideRoot(e.to_string()))?;
        if self.roots.iter().any(|r| path.is_under(r)) {
            Ok(path)
        } else {
            Err(SafetyError::OutsideRoot(path.as_str().to_string()))
        }
    }

    /// 删除/新建/传输：必须是安全根的**真子路径**，禁止对 `/sdcard` 等根本身动手。
    pub fn check_descendant(&self, raw: &str) -> Result<RemotePath, SafetyError> {
        let path = RemotePath::parse(raw).map_err(|e| SafetyError::OutsideRoot(e.to_string()))?;
        if self.roots.iter().any(|r| path.is_strictly_under(r)) {
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
        assert!(matches!(
            RemotePath::parse("sdcard/a"),
            Err(PathError::NotAbsolute(_))
        ));
        assert!(matches!(
            RemotePath::parse("/sdcard/../etc"),
            Err(PathError::Traversal(_))
        ));
        assert!(matches!(
            RemotePath::parse("/a/../../b"),
            Err(PathError::Traversal(_))
        ));
    }

    #[test]
    fn is_under_semantics() {
        let root = RemotePath::parse("/sdcard").unwrap();
        assert!(RemotePath::parse("/sdcard").unwrap().is_under(&root));
        assert!(RemotePath::parse("/sdcard/DCIM/x.jpg")
            .unwrap()
            .is_under(&root));
        // 前缀防伪：/sdcardevil 不算
        assert!(!RemotePath::parse("/sdcardevil").unwrap().is_under(&root));
    }

    #[test]
    fn safety_root_checks() {
        let safety = SafetyRoot::default();
        assert!(safety.check("/sdcard/DCIM/a.jpg").is_ok());
        assert!(safety.check("/storage/emulated/0/b").is_ok());
        assert!(safety.check("/sdcard").is_ok());
        assert!(matches!(
            safety.check("/"),
            Err(SafetyError::OutsideRoot(_))
        ));
        assert!(matches!(
            safety.check("/data/local/tmp/x"),
            Err(SafetyError::OutsideRoot(_))
        ));
        assert!(matches!(
            safety.check("/sdcard/../data/x"),
            Err(SafetyError::OutsideRoot(_))
        ));
    }

    #[test]
    fn mutate_forbids_safety_root_itself() {
        let safety = SafetyRoot::default();
        assert!(safety.check_descendant("/sdcard/DCIM/a.jpg").is_ok());
        assert!(matches!(
            safety.check_descendant("/sdcard"),
            Err(SafetyError::OutsideRoot(_))
        ));
        assert!(matches!(
            safety.check_descendant("/sdcard/"),
            Err(SafetyError::OutsideRoot(_))
        ));
        assert!(matches!(
            safety.check_descendant("/storage"),
            Err(SafetyError::OutsideRoot(_))
        ));
        assert!(matches!(
            safety.check_descendant("/data/local/tmp/x"),
            Err(SafetyError::OutsideRoot(_))
        ));
    }

    #[test]
    fn file_name_last_segment() {
        assert_eq!(
            RemotePath::parse("/sdcard/a.txt").unwrap().file_name(),
            "a.txt"
        );
        assert_eq!(RemotePath::parse("/sdcard").unwrap().file_name(), "sdcard");
        assert_eq!(RemotePath::parse("/").unwrap().file_name(), "");
    }

    #[test]
    fn validate_entry_name_rejects_separators() {
        assert!(validate_entry_name("ok.txt").is_ok());
        assert!(validate_entry_name("").is_err());
        assert!(validate_entry_name("..").is_err());
        assert!(validate_entry_name("a/b").is_err());
        assert!(validate_entry_name("a\\b").is_err());
    }

    #[test]
    fn validate_entry_name_shared_fixture() {
        #[derive(serde::Deserialize)]
        struct Case {
            name: String,
            valid: bool,
        }
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../testdata/entry_name.json")).expect("fixture");
        for (i, case) in cases.iter().enumerate() {
            assert_eq!(validate_entry_name(&case.name).is_ok(), case.valid, "case {i}");
        }
    }
}
