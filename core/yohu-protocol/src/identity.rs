//! 应用身份与路径目录契约（关于 / 标题栏 / 安装包 / 数据根共用）。
//!
//! 常量是产品单源：文件夹名、模块数据目录、展示名不得在壳或 UI 再写一份。
//! 版本号运行时由 `yohu-app` 填入 [`AppIdentity::with_version`]（`CARGO_PKG_VERSION`）。

use serde::{Deserialize, Serialize};

use crate::settings::AppSettings;

/// 产品名 / 主程序文件名 / LocalAppData 目录名。
pub const PRODUCT_NAME: &str = "YohuAdbTools";
/// 窗口标题、状态栏、关于页展示名。
pub const DISPLAY_NAME: &str = "Yohu ADB Tools";
/// 包标识（Tauri `identifier`）。
pub const IDENTIFIER: &str = "com.yohu.adbtools";
/// 一句话定位（关于页）。
pub const DESCRIPTION: &str = "设备工具工作台";
/// 版权行。
pub const COPYRIGHT: &str = "© 2026 Yohu";
/// `%LOCALAPPDATA%\<DATA_DIR_NAME>\`
pub const DATA_DIR_NAME: &str = PRODUCT_NAME;

/// 设备路径安全根（ADR-v6-013）。UI 面包屑夹紧与 domain `SafetyRoot::default` 共用。
pub mod safety_root {
    pub const SDCARD: &str = "/sdcard";
    pub const STORAGE: &str = "/storage";
    pub const ALL: &[&str] = &[SDCARD, STORAGE];
}

/// 官方 scrcpy-server 钉死版本（协议无前后兼容）。
pub mod scrcpy {
    pub const SERVER_VERSION: &str = "4.1";
    pub const DEVICE_SERVER_PATH: &str = "/data/local/tmp/scrcpy-server.jar";
    pub const DEVICE_NAME_FIELD_LENGTH: usize = 64;
    pub const CODEC_H264: u32 = 0x6832_3634;
    pub const CODEC_H265: u32 = 0x6832_3635;
    pub const CODEC_AV1: u32 = 0x0061_7631;
}

/// 模块 id（与 UI `ModuleDescriptor.id`、数据目录 `modules/<id>/` 一致）。
pub mod module_id {
    pub const TERMINAL: &str = "adb-terminal";
    pub const FILES: &str = "file-manager";
    pub const LOGS: &str = "log-analyzer";
    pub const MIRROR: &str = "screen-mirror";
    pub const SETTINGS: &str = "settings";
}

/// LocalAppData 根下的固定段（不随 `data_root` 迁移）。
pub mod dir {
    pub const SETTINGS: &str = "settings";
    pub const SETTINGS_FILE: &str = "settings.json";
    pub const LOGS: &str = "logs";
    pub const DATA: &str = "data";
    pub const TOOLS: &str = "tools";
    pub const ADB: &str = "adb";
    /// 官方 scrcpy-server 文件名（与 `tools/scrcpy-server`、bundle resources 一致）。
    pub const SCRCPY_SERVER: &str = "scrcpy-server";
    pub const MODULES: &str = "modules";
    pub const LIBRARY_CONFIG: &str = "config";
    pub const LIBRARY_FILE: &str = "library.json";
    pub const EXPORTS: &str = "exports";
    pub const DRAG_OUT: &str = "drag-out";
    /// 实时逐窗口日志文件目录（日志写入方式；`data/modules/log-analyzer/` 下）。
    pub const SESSION_LOGS: &str = "session-logs";
}

/// 应用身份（`system.info.identity`）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppIdentity {
    pub name: String,
    pub display_name: String,
    pub identifier: String,
    pub version: String,
    pub description: String,
    pub copyright: String,
}

impl AppIdentity {
    /// 用工作区版本填满身份（名称等取本模块常量）。
    pub fn with_version(version: impl Into<String>) -> Self {
        Self {
            name: PRODUCT_NAME.into(),
            display_name: DISPLAY_NAME.into(),
            identifier: IDENTIFIER.into(),
            version: version.into(),
            description: DESCRIPTION.into(),
            copyright: COPYRIGHT.into(),
        }
    }
}

/// 解析后的绝对路径目录（`system.info.paths`）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppPathCatalog {
    /// `%LOCALAPPDATA%\YohuAdbTools`
    pub local_root: String,
    pub settings_dir: String,
    pub settings_file: String,
    pub logs_dir: String,
    /// 数据根（可配置；默认 `local_root/data`）
    pub data_root: String,
    pub adb_tools_dir: String,
    pub library_file: String,
    pub exports_dir: String,
    /// 实时逐窗口日志文件目录（日志写入方式）
    pub session_logs_dir: String,
    pub drag_out_dir: String,
}

/// `system.info`：关于 / 诊断。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SystemInfo {
    pub identity: AppIdentity,
    pub paths: AppPathCatalog,
    pub adb_path: String,
    /// 最近一次设备扫描实际使用的 adb（诊断）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub adb_in_use: Option<String>,
    pub settings: AppSettings,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_serde_snake_case() {
        let id = AppIdentity::with_version("0.1.0");
        let v = serde_json::to_value(&id).expect("identity json");
        assert_eq!(v["name"], PRODUCT_NAME);
        assert_eq!(v["display_name"], DISPLAY_NAME);
        assert_eq!(v["identifier"], IDENTIFIER);
        assert_eq!(v["version"], "0.1.0");
        assert_eq!(v["description"], DESCRIPTION);
        assert_eq!(v["copyright"], COPYRIGHT);
    }

    #[test]
    fn data_dir_name_matches_product() {
        assert_eq!(DATA_DIR_NAME, PRODUCT_NAME);
    }

    #[test]
    fn module_ids_are_stable_path_segments() {
        assert_eq!(module_id::TERMINAL, "adb-terminal");
        assert_eq!(module_id::FILES, "file-manager");
        assert_eq!(module_id::LOGS, "log-analyzer");
        assert_eq!(module_id::MIRROR, "screen-mirror");
        assert_eq!(module_id::SETTINGS, "settings");
        assert_eq!(scrcpy::SERVER_VERSION, "4.1");
        assert_eq!(dir::SCRCPY_SERVER, "scrcpy-server");
    }

    #[test]
    fn safety_roots_are_absolute_device_paths() {
        assert_eq!(safety_root::ALL, &["/sdcard", "/storage"]);
        for root in safety_root::ALL {
            assert!(root.starts_with('/'));
            assert!(!root.contains(".."));
        }
    }
}
