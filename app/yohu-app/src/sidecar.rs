//! sidecar 官方 adb 资源目录解析（ADR-v6-008）。
//!
//! 三件套随安装包 / 可执行文件旁分发；运行时解压到 `DataRoot/tools/adb/`
//! 由 `yohu_adb::ToolResolver` 完成。本模块只负责找出「内置副本」所在目录。

use std::path::{Path, PathBuf};

use tauri::{App, Manager};

const ADB_EXE: &str = "adb.exe";

/// 解析内置官方 adb 所在目录（含 `adb.exe` + 两个 Win 动态库）。
///
/// 查找顺序：
/// 1. Tauri `resource_dir`（NSIS 安装包 resources）
/// 2. 可执行文件旁（`tauri build --no-bundle` / 便携直跑）
/// 3. 仓库 `tools/`（`cargo tauri dev` 与本地未打包 release）
pub fn resolve_resource_dir(app: &App) -> PathBuf {
    let mut dirs = Vec::new();
    if let Ok(dir) = app.path().resource_dir() {
        dirs.push(dir);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            dirs.push(parent.to_path_buf());
            dirs.push(parent.join("resources"));
        }
    }
    dirs.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("tools"),
    );

    for dir in &dirs {
        if let Some(found) = dir_with_adb(dir) {
            tracing::info!("sidecar adb 资源目录: {}", found.display());
            return found;
        }
    }

    let fallback = dirs.into_iter().next().unwrap_or_else(|| PathBuf::from("."));
    tracing::warn!("未找到内置 adb.exe，将使用: {}", fallback.display());
    fallback
}

fn dir_with_adb(dir: &Path) -> Option<PathBuf> {
    if dir.join(ADB_EXE).is_file() {
        return Some(dir.to_path_buf());
    }
    let nested = dir.join("tools");
    if nested.join(ADB_EXE).is_file() {
        return Some(nested);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dir_with_adb_accepts_flat_and_nested() {
        let root = std::env::temp_dir().join(format!("yohu-sidecar-{}-{}", std::process::id(), "adb"));
        let _ = std::fs::remove_dir_all(&root);
        let flat = root.join("flat");
        let nested = root.join("nested").join("tools");
        std::fs::create_dir_all(&flat).unwrap();
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(flat.join(ADB_EXE), b"adb").unwrap();
        std::fs::write(nested.join(ADB_EXE), b"adb").unwrap();

        assert_eq!(dir_with_adb(&flat).as_deref(), Some(flat.as_path()));
        assert_eq!(
            dir_with_adb(root.join("nested").as_path()).as_deref(),
            Some(nested.as_path())
        );
        assert!(dir_with_adb(&root).is_none());
        let _ = std::fs::remove_dir_all(&root);
    }
}
