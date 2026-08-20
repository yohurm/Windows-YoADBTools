//! 设备文件浏览（ls 解析）+ 拖出描述符树展开。

use std::collections::HashSet;
use std::sync::Arc;

use tokio_util::sync::CancellationToken;

use crate::FileError;
use yohu_adb::AdbClient;
use yohu_domain::{validate_entry_name, RemotePath, SafetyRoot};
use yohu_protocol::{EntryKind, RemoteEntry};

/// 单次拖出展开上限，避免巨大目录卡死 DoDragDrop 前的列举。
pub const MAX_TREE_ENTRIES: usize = 4096;
const MAX_TREE_DEPTH: u32 = 24;

/// 拖出描述符一条：远端绝对路径 + Explorer 相对路径（`\`）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TreeEntry {
    pub remote: String,
    pub relative: String,
    pub is_dir: bool,
    pub size: u64,
}

/// 文件浏览器。
pub struct FileBrowser {
    adb: Arc<AdbClient>,
    safety: SafetyRoot,
}

impl FileBrowser {
    pub fn new(adb: Arc<AdbClient>) -> Self {
        Self {
            adb,
            safety: SafetyRoot::default(),
        }
    }

    /// 列出设备目录。路径必须位于安全根内（含根本身）；不信任 UI。
    ///
    /// 尾斜杠语义：`ls -la /sdcard/` 会跟随符号链接列出目标目录内容
    /// （部分机型 `/sdcard -> /storage/self/primary`，不带尾斜杠只列出链接本身）。
    pub async fn list(
        &self,
        serial: &str,
        path: &str,
        cancel: CancellationToken,
    ) -> Result<Vec<RemoteEntry>, FileError> {
        let normalized = self
            .safety
            .check(path)
            .map_err(|e| FileError::OutsideRoot(e.to_string()))?;
        let listing = format!("{}/", normalized.as_str());
        Ok(self.adb.ls(serial, &listing, cancel).await?)
    }

    /// 把一组远端路径展开成 FILEDESCRIPTOR 树（目录递归；文件一条）。
    /// 每条必须是安全根真子路径（与 pull 相同）。
    pub async fn list_tree(
        &self,
        serial: &str,
        remotes: &[String],
        cancel: CancellationToken,
    ) -> Result<Vec<TreeEntry>, FileError> {
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        for raw in remotes {
            let path = self
                .safety
                .check_descendant(raw)
                .map_err(|e| FileError::OutsideRoot(e.to_string()))?;
            if !seen.insert(path.as_str().to_string()) {
                continue;
            }
            let (is_dir, size) = self.classify(serial, &path, cancel.clone()).await?;
            self.push_tree(
                serial,
                path,
                String::new(),
                is_dir,
                size,
                0,
                &mut out,
                &mut seen,
                cancel.clone(),
            )
            .await?;
        }
        if out.is_empty() {
            return Err(FileError::Path("没有可拖出的项目".into()));
        }
        Ok(out)
    }

    async fn classify(
        &self,
        serial: &str,
        path: &RemotePath,
        cancel: CancellationToken,
    ) -> Result<(bool, u64), FileError> {
        let parent =
            parent_remote(path.as_str()).ok_or_else(|| FileError::Path(path.as_str().into()))?;
        let name = path.file_name();
        let entries = self.list(serial, parent, cancel).await?;
        let entry = entries
            .iter()
            .find(|e| e.name == name)
            .ok_or_else(|| FileError::Path(format!("条目不存在: {}", path.as_str())))?;
        Ok(match entry.kind {
            EntryKind::Dir => (true, 0),
            EntryKind::File | EntryKind::Other => (false, entry.size),
            EntryKind::Symlink => (true, 0),
        })
    }

    #[allow(clippy::too_many_arguments)]
    fn push_tree<'a>(
        &'a self,
        serial: &'a str,
        remote: RemotePath,
        parent_rel: String,
        is_dir: bool,
        size: u64,
        depth: u32,
        out: &'a mut Vec<TreeEntry>,
        seen: &'a mut HashSet<String>,
        cancel: CancellationToken,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), FileError>> + Send + 'a>>
    {
        Box::pin(async move {
            if out.len() >= MAX_TREE_ENTRIES {
                return Err(FileError::Path(format!(
                    "拖出目录超过 {MAX_TREE_ENTRIES} 项"
                )));
            }
            let name = remote.file_name();
            if name.is_empty() {
                return Err(FileError::Path(remote.as_str().into()));
            }
            let relative = join_win_relative(&parent_rel, name);
            out.push(TreeEntry {
                remote: remote.as_str().to_string(),
                relative: relative.clone(),
                is_dir,
                size,
            });
            if !is_dir || depth >= MAX_TREE_DEPTH {
                return Ok(());
            }
            let children = match self.list(serial, remote.as_str(), cancel.clone()).await {
                Ok(list) => list,
                Err(_) if parent_rel.is_empty() => {
                    // 顶层被当成目录但 ls 失败（例如指向文件的 symlink）→ 改记为文件
                    if let Some(last) = out.last_mut() {
                        last.is_dir = false;
                    }
                    return Ok(());
                }
                Err(_) => {
                    // 子树不可列：保留本目录描述符，不让整次拖出失败
                    return Ok(());
                }
            };
            for child in children {
                if cancel.is_cancelled() {
                    return Err(FileError::Adb(yohu_adb::AdbError::Cancelled));
                }
                if validate_entry_name(&child.name).is_err() {
                    continue;
                }
                let child_raw = format!("{}/{}", remote.as_str(), child.name);
                let child_path = self
                    .safety
                    .check_descendant(&child_raw)
                    .map_err(|e| FileError::OutsideRoot(e.to_string()))?;
                if !seen.insert(child_path.as_str().to_string()) {
                    continue;
                }
                let child_dir = child.kind == EntryKind::Dir || child.kind == EntryKind::Symlink;
                let child_size = if child_dir { 0 } else { child.size };
                self.push_tree(
                    serial,
                    child_path,
                    relative.clone(),
                    child_dir,
                    child_size,
                    depth + 1,
                    out,
                    seen,
                    cancel.clone(),
                )
                .await?;
            }
            Ok(())
        })
    }
}

/// `DCIM` + `Camera` → `DCIM\Camera`。
pub fn join_win_relative(parent: &str, name: &str) -> String {
    if parent.is_empty() {
        name.to_string()
    } else {
        format!("{parent}\\{name}")
    }
}

fn parent_remote(path: &str) -> Option<&str> {
    let trimmed = path.trim_end_matches('/');
    let idx = trimmed.rfind('/')?;
    if idx == 0 {
        Some("/")
    } else {
        Some(&trimmed[..idx])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn join_win_relative_builds_backslash_tree() {
        assert_eq!(join_win_relative("", "DCIM"), "DCIM");
        assert_eq!(join_win_relative("DCIM", "a.jpg"), "DCIM\\a.jpg");
        assert_eq!(
            join_win_relative("DCIM\\Camera", "x.png"),
            "DCIM\\Camera\\x.png"
        );
    }

    #[test]
    fn parent_remote_stops_at_root() {
        assert_eq!(parent_remote("/sdcard/DCIM/a.jpg"), Some("/sdcard/DCIM"));
        assert_eq!(parent_remote("/sdcard"), Some("/"));
        assert_eq!(parent_remote("/"), None);
    }
}
