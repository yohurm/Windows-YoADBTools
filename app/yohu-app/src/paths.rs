//! 路径规划（需求文档 §4.5 / 架构文档 §10.1）：全部在 LocalAppData，无管理员权限。
//!
//! ```text
//! %LOCALAPPDATA%\<DATA_DIR_NAME>\          # 固定根，不随 data_root 迁移
//! ├── settings\settings.json
//! ├── logs\                                # app-*.log + panic-*.log
//! └── data\                                # DataRoot（可配置，重启生效）
//!     ├── tools\adb\
//!     └── modules\
//!         ├── adb-terminal\config\library.json
//!         ├── log-analyzer\exports\
//!         └── file-manager\drag-out\
//! ```

use std::path::{Path, PathBuf};

use yohu_protocol::{dir, module_id, AppPathCatalog, DATA_DIR_NAME};

/// 应用路径集（启动时冻结；`data_root` 重启生效）。
#[derive(Debug, Clone)]
pub struct AppPaths {
    /// `%LOCALAPPDATA%\<DATA_DIR_NAME>`
    pub local_root: PathBuf,
    /// 数据根（可由设置覆盖）
    pub data_root: PathBuf,
    pub settings_dir: PathBuf,
    pub settings_file: PathBuf,
    /// 崩溃 / 应用诊断日志目录
    pub logs_dir: PathBuf,
}

impl AppPaths {
    pub fn local_root() -> PathBuf {
        let base = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(base).join(DATA_DIR_NAME)
    }

    /// 默认应用日志目录（启动 tracing 早于设置加载，与 [`Self::resolve`] 的 `logs_dir` 相同）。
    pub fn default_logs_dir() -> PathBuf {
        Self::local_root().join(dir::LOGS)
    }

    /// 设置文件（探针用：与 data.root 无关）。
    pub fn probe_settings_file() -> PathBuf {
        Self::local_root()
            .join(dir::SETTINGS)
            .join(dir::SETTINGS_FILE)
    }

    /// 解析路径集；`settings_data_root` 为空时用默认数据根。
    pub fn resolve(settings_data_root: &str) -> Self {
        let local_root = Self::local_root();
        let settings_dir = local_root.join(dir::SETTINGS);
        let data_root = if settings_data_root.trim().is_empty() {
            local_root.join(dir::DATA)
        } else {
            PathBuf::from(settings_data_root)
        };
        Self {
            local_root: local_root.clone(),
            data_root,
            settings_dir: settings_dir.clone(),
            settings_file: settings_dir.join(dir::SETTINGS_FILE),
            logs_dir: local_root.join(dir::LOGS),
        }
    }

    /// `DataRoot/tools/adb/`（sidecar 解压目标）。
    pub fn adb_tools_dir(&self) -> PathBuf {
        self.data_root.join(dir::TOOLS).join(dir::ADB)
    }

    /// 模块数据目录：`DataRoot/modules/<id>/`。
    pub fn module_data(&self, module_id: &str) -> PathBuf {
        self.data_root.join(dir::MODULES).join(module_id)
    }

    /// 命令库文件：`DataRoot/modules/adb-terminal/config/library.json`。
    pub fn library_file(&self) -> PathBuf {
        self.module_data(module_id::TERMINAL)
            .join(dir::LIBRARY_CONFIG)
            .join(dir::LIBRARY_FILE)
    }

    /// 日志导出目录。
    pub fn exports_dir(&self) -> PathBuf {
        self.module_data(module_id::LOGS).join(dir::EXPORTS)
    }

    /// 拖出虚拟文件临时区：`DataRoot/modules/file-manager/drag-out/`。
    pub fn drag_out_dir(&self) -> PathBuf {
        self.module_data(module_id::FILES).join(dir::DRAG_OUT)
    }

    /// 关于页/诊断用的绝对路径目录。
    pub fn catalog(&self) -> AppPathCatalog {
        AppPathCatalog {
            local_root: path_string(&self.local_root),
            settings_dir: path_string(&self.settings_dir),
            settings_file: path_string(&self.settings_file),
            logs_dir: path_string(&self.logs_dir),
            data_root: path_string(&self.data_root),
            adb_tools_dir: path_string(&self.adb_tools_dir()),
            library_file: path_string(&self.library_file()),
            exports_dir: path_string(&self.exports_dir()),
            drag_out_dir: path_string(&self.drag_out_dir()),
        }
    }
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_data_root_uses_local_default() {
        let p = AppPaths::resolve("");
        assert_eq!(p.data_root, AppPaths::local_root().join(dir::DATA));
        assert_eq!(p.logs_dir, AppPaths::default_logs_dir());
        assert_eq!(p.settings_file, AppPaths::probe_settings_file());
        assert_eq!(p.local_root, AppPaths::local_root());
        assert_eq!(p.logs_dir, p.local_root.join(dir::LOGS));
    }

    #[test]
    fn custom_data_root_does_not_move_logs_or_settings() {
        let custom = PathBuf::from("D:\\YohuData");
        let p = AppPaths::resolve(custom.to_str().expect("utf-8"));
        assert_eq!(p.data_root, custom);
        assert_eq!(p.logs_dir, AppPaths::local_root().join(dir::LOGS));
        assert_eq!(p.settings_dir, AppPaths::local_root().join(dir::SETTINGS));
        assert_eq!(p.settings_file, AppPaths::probe_settings_file());
    }

    #[test]
    fn module_layout_matches_architecture() {
        let p = AppPaths::resolve(r"X:\data");
        let root = PathBuf::from(r"X:\data");
        assert_eq!(
            p.library_file(),
            root.join(dir::MODULES)
                .join(module_id::TERMINAL)
                .join(dir::LIBRARY_CONFIG)
                .join(dir::LIBRARY_FILE)
        );
        assert_eq!(
            p.exports_dir(),
            root.join(dir::MODULES)
                .join(module_id::LOGS)
                .join(dir::EXPORTS)
        );
        assert_eq!(
            p.drag_out_dir(),
            root.join(dir::MODULES)
                .join(module_id::FILES)
                .join(dir::DRAG_OUT)
        );
        assert_eq!(p.adb_tools_dir(), root.join(dir::TOOLS).join(dir::ADB));
    }

    #[test]
    fn catalog_strings_are_absolute_or_custom() {
        let p = AppPaths::resolve("");
        let c = p.catalog();
        assert_eq!(c.data_root, path_string(&p.data_root));
        assert_eq!(c.library_file, path_string(&p.library_file()));
        assert!(c.settings_file.ends_with(dir::SETTINGS_FILE));
    }
}
