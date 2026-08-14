//! 路径规划（需求文档 §4.5 / 架构文档 §10.1）：全部在 LocalAppData，无管理员权限。

use std::path::PathBuf;

/// 应用路径集（启动时冻结；`data.root` 重启生效）。
#[derive(Debug, Clone)]
pub struct AppPaths {
    /// 数据根（可由设置覆盖）
    pub data_root: PathBuf,
    /// 崩溃日志目录
    pub logs_dir: PathBuf,
}

impl AppPaths {
    fn local_root() -> PathBuf {
        let base = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(base).join("YovoAdbTools")
    }

    /// 设置文件（探针用：与 data.root 无关）。
    pub fn probe_settings_file() -> PathBuf {
        Self::local_root().join("settings").join("settings.json")
    }

    /// 解析路径集；`settings_data_root` 为空时用默认数据根。
    pub fn resolve(settings_data_root: &str) -> Self {
        let root = Self::local_root();
        let data_root = if settings_data_root.trim().is_empty() {
            root.join("data")
        } else {
            PathBuf::from(settings_data_root)
        };
        Self { data_root, logs_dir: root.join("logs") }
    }

    /// `DataRoot/tools/adb/`（sidecar 解压目标）。
    pub fn adb_tools_dir(&self) -> PathBuf {
        self.data_root.join("tools").join("adb")
    }

    /// 模块数据目录：`DataRoot/modules/<id>/`。
    pub fn module_data(&self, module_id: &str) -> PathBuf {
        self.data_root.join("modules").join(module_id)
    }

    /// 命令库文件：`DataRoot/modules/adb-terminal/config/library.json`。
    pub fn library_file(&self) -> PathBuf {
        self.module_data("adb-terminal").join("config").join("library.json")
    }

    /// 日志导出目录。
    pub fn exports_dir(&self) -> PathBuf {
        self.module_data("log-analyzer").join("exports")
    }
}
