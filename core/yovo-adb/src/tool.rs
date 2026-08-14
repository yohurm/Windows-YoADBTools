//! sidecar adb 工具解析（需求文档 §4.3）。
//!
//! 解析顺序：用户设置（`adb.path`，可运行时更新、立即生效）→ 应用旁/资源目录 →
//! `DataRoot/tools/adb/` 解压。本模块零 Tauri 依赖：目录由 app 层解析后传入。

use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use crate::error::AdbError;

/// sidecar 三件套文件名。
pub const ADB_FILES: [&str; 3] = ["adb.exe", "AdbWinApi.dll", "AdbWinUsbApi.dll"];

/// adb 工具解析器。
#[derive(Clone)]
pub struct ToolResolver {
    /// 用户自定义 adb.exe 路径（设置 `adb.path`；空 = 自动解析；运行时可变）
    user_path: Arc<RwLock<Option<PathBuf>>>,
    /// 应用旁工具目录（安装包 resources / 仓库 tools/），内含 adb.exe + 两个 dll
    resource_dir: PathBuf,
    /// 解压目标：`DataRoot/tools/adb/`
    data_tools_dir: PathBuf,
}

impl ToolResolver {
    pub fn new(user_path: Option<PathBuf>, resource_dir: PathBuf, data_tools_dir: PathBuf) -> Self {
        Self { user_path: Arc::new(RwLock::new(user_path)), resource_dir, data_tools_dir }
    }

    /// 更新用户自定义路径（设置 `adb.path` 立即生效）。
    pub fn set_user_path(&self, path: Option<PathBuf>) {
        *self.user_path.write().expect("tool lock poisoned") = path;
    }

    /// 解析可用 adb.exe。
    pub fn resolve(&self) -> Result<PathBuf, AdbError> {
        if let Some(p) = self.user_path.read().expect("tool lock poisoned").clone() {
            if p.is_file() {
                return Ok(p);
            }
            tracing::warn!("adb.path 指向的文件不存在: {}", p.display());
        }
        let adjacent = self.resource_dir.join("adb.exe");
        if adjacent.is_file() {
            return Ok(adjacent);
        }
        self.ensure_extracted()?;
        let extracted = self.data_tools_dir.join("adb.exe");
        if extracted.is_file() {
            Ok(extracted)
        } else {
            Err(AdbError::ToolUnavailable(format!(
                "资源目录与数据目录均无 adb.exe: {} / {}",
                self.resource_dir.display(),
                self.data_tools_dir.display()
            )))
        }
    }

    /// 从资源目录复制三件套到数据目录（幂等）。
    pub fn ensure_extracted(&self) -> Result<(), AdbError> {
        std::fs::create_dir_all(&self.data_tools_dir)?;
        for name in ADB_FILES {
            let src = self.resource_dir.join(name);
            if !src.is_file() {
                continue;
            }
            let dst = self.data_tools_dir.join(name);
            if !dst.is_file() {
                std::fs::copy(&src, &dst)?;
                tracing::info!("已解压 adb 工具: {}", dst.display());
            }
        }
        Ok(())
    }

    /// 预热（启动时调用，不阻塞窗口；失败仅记录，后续 resolve 会兜底重试）。
    pub async fn warm_up(&self) {
        let data = self.data_tools_dir.clone();
        let resource = self.resource_dir.clone();
        let result = tokio::task::spawn_blocking(move || {
            std::fs::create_dir_all(&data)?;
            for name in ADB_FILES {
                let src = resource.join(name);
                if !src.is_file() {
                    continue;
                }
                let dst = data.join(name);
                if !dst.is_file() {
                    std::fs::copy(&src, &dst)?;
                }
            }
            Ok::<(), std::io::Error>(())
        })
        .await;
        if let Err(e) = result {
            tracing::warn!("adb 预热解压失败: {e}");
        }
    }
}
