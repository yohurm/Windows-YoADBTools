//! 危险操作（删除/新建目录）：core 侧 SafetyRoot 强制校验。

use std::sync::Arc;

use tokio_util::sync::CancellationToken;

use crate::FileError;
use yovo_adb::AdbClient;
use yovo_domain::SafetyRoot;

/// 设备文件变更器。
pub struct FileMutator {
    adb: Arc<AdbClient>,
    safety: SafetyRoot,
}

impl FileMutator {
    pub fn new(adb: Arc<AdbClient>) -> Self {
        Self { adb, safety: SafetyRoot::default() }
    }

    /// 删除（递归）。**必须通过安全根校验**，用户确认由 UI 负责、core 二次强制。
    pub async fn delete(
        &self,
        serial: &str,
        path: &str,
        cancel: CancellationToken,
    ) -> Result<(), FileError> {
        let normalized = self
            .safety
            .check(path)
            .map_err(|e| FileError::OutsideRoot(e.to_string()))?;
        let out = self
            .adb
            .run(serial, &["shell".into(), "rm".into(), "-rf".into(), normalized.as_str().into()], Some(30_000), cancel)
            .await?;
        if out.exit_code != 0 {
            return Err(FileError::Adb(yovo_adb::AdbError::BadExit {
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
        let normalized = self
            .safety
            .check(path)
            .map_err(|e| FileError::OutsideRoot(e.to_string()))?;
        let out = self
            .adb
            .run(serial, &["shell".into(), "mkdir".into(), "-p".into(), normalized.as_str().into()], Some(15_000), cancel)
            .await?;
        if out.exit_code != 0 {
            return Err(FileError::Adb(yovo_adb::AdbError::BadExit {
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
        let normalized = self
            .safety
            .check(path)
            .map_err(|e| FileError::OutsideRoot(e.to_string()))?;
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
            return Err(FileError::Adb(yovo_adb::AdbError::BadExit {
                exit_code: out.exit_code,
                stderr: out.stderr,
            }));
        }
        Ok(())
    }
}
