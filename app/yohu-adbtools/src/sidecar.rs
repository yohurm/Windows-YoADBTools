//! sidecar 官方 adb 资源目录解析（ADR-v6-008）。
//!
//! 开发与 release 默认布局一致：应用旁 `tools/`（adb.exe + 两个 dll）。
//! 运行时再幂等复制到 `DataRoot/tools/adb/`，由 `yohu_adb::ToolResolver` 完成。
//! 本模块只负责找出「内置副本」所在目录。

use std::path::{Path, PathBuf};

use tauri::{App, Manager};
use yohu_protocol::dir;

const ADB_EXE: &str = "adb.exe";

/// 解析内置官方 adb 所在目录（含 `adb.exe` + 两个 Win 动态库）。
///
/// 查找顺序（与开发仓库 `tools/` 对齐）：
/// 1. 可执行文件旁 `tools/`（dev `target/*/tools`、NSIS 安装目录 `tools/`）
/// 2. Tauri `resource_dir` 下 `tools/`（安装包 resources）
/// 3. 仓库 `tools/`（`cargo tauri dev` 且尚未拷到 target 时）
pub fn resolve_resource_dir(app: &App) -> PathBuf {
    let mut dirs = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            dirs.push(parent.join(dir::TOOLS));
            dirs.push(parent.join("resources").join(dir::TOOLS));
        }
    }
    if let Ok(res) = app.path().resource_dir() {
        dirs.push(res.join(dir::TOOLS));
    }
    dirs.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join(dir::TOOLS),
    );

    for candidate in &dirs {
        if let Some(found) = dir_with_adb(candidate) {
            tracing::info!("sidecar adb 资源目录: {}", found.display());
            return found;
        }
    }

    let fallback = dirs
        .into_iter()
        .next()
        .unwrap_or_else(|| PathBuf::from("."));
    tracing::warn!("未找到内置 adb.exe，将使用: {}", fallback.display());
    fallback
}

/// 固定 `base/tools/` 布局（ADR-v6-008；不再接受旧扁平 `base/` 布局——v6 推倒重来、无兼容层）。
fn dir_with_adb(base: &Path) -> Option<PathBuf> {
    let nested = base.join(dir::TOOLS);
    if nested.join(ADB_EXE).is_file() {
        Some(nested)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dir_with_adb_only_nested_layout() {
        let root =
            std::env::temp_dir().join(format!("yohu-sidecar-{}-{}", std::process::id(), "adb"));
        let _ = std::fs::remove_dir_all(&root);
        let flat = root.join("flat");
        let nested = root.join("nested").join(dir::TOOLS);
        std::fs::create_dir_all(&flat).unwrap();
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(flat.join(ADB_EXE), b"flat").unwrap();
        std::fs::write(nested.join(ADB_EXE), b"nested").unwrap();

        // 旧扁平布局（base/adb.exe）不再识别——v6 无兼容层。
        assert!(dir_with_adb(&flat).is_none());
        assert_eq!(
            dir_with_adb(root.join("nested").as_path()).as_deref(),
            Some(nested.as_path())
        );
        assert!(dir_with_adb(&root).is_none());
        let _ = std::fs::remove_dir_all(&root);
    }
}
