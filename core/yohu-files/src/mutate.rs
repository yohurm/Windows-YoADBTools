//! 危险操作（删除/新建）：core 侧 SafetyRoot + 末段名强制校验。

use std::sync::Arc;

use tokio_util::sync::CancellationToken;

use crate::FileError;
use yohu_adb::AdbClient;
use yohu_domain::{validate_entry_name, RemotePath, SafetyRoot};

/// 设备文件变更器。
pub struct FileMutator {
    adb: Arc<AdbClient>,
    safety: SafetyRoot,
}

impl FileMutator {
    pub fn new(adb: Arc<AdbClient>) -> Self {
        Self {
            adb,
            safety: SafetyRoot::default(),
        }
    }

    fn normalize_mut(&self, path: &str) -> Result<RemotePath, FileError> {
        let normalized = self
            .safety
            .check_descendant(path)
            .map_err(|e| FileError::OutsideRoot(e.to_string()))?;
        validate_entry_name(normalized.file_name()).map_err(|e| FileError::Path(e.to_string()))?;
        Ok(normalized)
    }

    /// 删除（递归）。**必须通过安全根校验**，用户确认由 UI 负责、core 二次强制。
    pub async fn delete(
        &self,
        serial: &str,
        path: &str,
        cancel: CancellationToken,
    ) -> Result<(), FileError> {
        let normalized = self.normalize_mut(path)?;
        let out = self
            .adb
            .run(
                serial,
                &[
                    "shell".into(),
                    "rm".into(),
                    "-rf".into(),
                    normalized.as_str().into(),
                ],
                Some(30_000),
                cancel,
            )
            .await?;
        if out.exit_code != 0 {
            return Err(FileError::Adb(yohu_adb::AdbError::BadExit {
                exit_code: out.exit_code,
                stderr: out.stderr,
            }));
        }
        Ok(())
    }

    /// 新建目录（`mkdir -p`）。
    pub async fn mkdir(
        &self,
        serial: &str,
        path: &str,
        cancel: CancellationToken,
    ) -> Result<(), FileError> {
        let normalized = self.normalize_mut(path)?;
        let out = self
            .adb
            .run(
                serial,
                &[
                    "shell".into(),
                    "mkdir".into(),
                    "-p".into(),
                    normalized.as_str().into(),
                ],
                Some(15_000),
                cancel,
            )
            .await?;
        if out.exit_code != 0 {
            return Err(FileError::Adb(yohu_adb::AdbError::BadExit {
                exit_code: out.exit_code,
                stderr: out.stderr,
            }));
        }
        Ok(())
    }

    /// 新建空文件（`touch`；已存在则只更新时间）。
    pub async fn create_file(
        &self,
        serial: &str,
        path: &str,
        cancel: CancellationToken,
    ) -> Result<(), FileError> {
        let normalized = self.normalize_mut(path)?;
        let out = self
            .adb
            .run(
                serial,
                &["shell".into(), "touch".into(), normalized.as_str().into()],
                Some(15_000),
                cancel,
            )
            .await?;
        if out.exit_code != 0 {
            return Err(FileError::Adb(yohu_adb::AdbError::BadExit {
                exit_code: out.exit_code,
                stderr: out.stderr,
            }));
        }
        Ok(())
    }
}
