//! yohu-files — 文件模块服务。
//!
//! 高内聚边界：浏览/传输/变更；**危险路径校验在 core 侧强制**（ADR-v6-013），
//! 不信任 UI 传来的路径。

pub mod browse;
pub mod mutate;
pub mod transfer;

pub use browse::{join_win_relative, FileBrowser, TreeEntry, MAX_TREE_ENTRIES};
pub use mutate::FileMutator;
pub use transfer::{TransferRunner, TransferSpec};

use tokio_util::sync::CancellationToken;

use yohu_domain::RemotePath;
use yohu_adb::AdbClient;

use thiserror::Error;

/// 对「设备端 realpath 解析结果」的安全根复核（ADR-v6-013 补充，符号链接逃逸守卫）。
///
/// 词典校验（`SafetyRoot::check_descendant`）只防 `..` 与根本身，**不解析符号链接**。
/// 若设备侧存在 `link -> /data`（或 `/`、`/system`），词典校验无法发现 `rm -rf /sdcard/link/...`
/// 或 `adb push x /sdcard/link/...` 会作用到安全根之外。本函数把 `readlink -f` 解析出的规范路径
/// 再过一次 `check_descendant`（根集含 `/sdcard` 与 `/storage`，故 `/sdcard -> /storage/self/primary`
/// 等合法链接通过，`/sdcard/link -> /data` 则逃逸被拒）。
///
/// 纯函数，可单测「接受 / 拒绝」决策。
pub(crate) fn recheck_resolved(safety: &yohu_domain::SafetyRoot, resolved: &str) -> Result<(), FileError> {
    safety
        .check_descendant(resolved)
        .map(|_| ())
        .map_err(|e| FileError::OutsideRoot(e.to_string()))
}

/// 危险操作前的设备端 realpath 复核（符号链接逃逸守卫）。
///
/// 在 `delete` / `mkdir` / `create_file` / `push` / `pull` 等会作用到设备文件系统的操作前调用：
/// 先用 `adb shell readlink -f` 解析规范路径，再把它过安全根。语义：
/// - 解析成功且逃逸安全根 → 拒绝（`OutsideRoot`）
/// - 解析成功且在安全根内 → 通过
/// - 解析失败 / 命令不可用 / 目标尚未存在 → **保守放行**（词典校验已过；且 `/sdcard` 本身常为
///   symlink，不能因解析不成功就误杀合法操作）
pub(crate) async fn resolve_and_recheck(
    adb: &AdbClient,
    safety: &yohu_domain::SafetyRoot,
    serial: &str,
    path: &RemotePath,
    cancel: CancellationToken,
) -> Result<(), FileError> {
    match adb.readlink_f(serial, path.as_str(), cancel.clone()).await {
        Ok(Some(resolved)) => recheck_resolved(safety, &resolved),
        _ => Ok(()),
    }
}

/// 文件服务错误。
#[derive(Debug, Error)]
pub enum FileError {
    #[error("路径非法: {0}")]
    Path(String),
    #[error("路径不在安全根内: {0}")]
    OutsideRoot(String),
    #[error("本地路径不存在: {0}")]
    LocalNotFound(String),
    #[error("ADB 错误: {0}")]
    Adb(#[from] yohu_adb::AdbError),
}

#[cfg(test)]
mod tests {
    use super::recheck_resolved;
    use yohu_domain::SafetyRoot;

    /// 符号链接逃逸守卫的「接受/拒绝」决策：
    /// 合法 `/sdcard -> /storage/self/primary` 映射与普通 `/storage` 子路径必须通过；
    /// 逃逸到 `/data`、`/`、`/system` 或安全根本身必须拒绝。
    #[test]
    fn recheck_resolved_accepts_legit_storage_and_rejects_escape() {
        let safety = SafetyRoot::default();

        // 合法：/sdcard 解析到 /storage 命名空间（FUSE 挂载点，readlink 停在那里）
        assert!(recheck_resolved(&safety, "/storage/emulated/0/DCIM").is_ok());
        assert!(recheck_resolved(&safety, "/storage/self/primary/DCIM/a.jpg").is_ok());
        // 合法：本身就是 /storage 下的真目录
        assert!(recheck_resolved(&safety, "/storage/emulated/0").is_ok());

        // 逃逸：符号链接指向安全根之外
        assert!(recheck_resolved(&safety, "/data/local/tmp/x").is_err());
        assert!(recheck_resolved(&safety, "/data/x").is_err());
        assert!(recheck_resolved(&safety, "/system/x").is_err());
        assert!(recheck_resolved(&safety, "/etc/x").is_err());
        // 逃逸到根本身
        assert!(recheck_resolved(&safety, "/").is_err());
        // 安全根本身：delete/mkdir/transfer 必须是真子路径，不由 realpath 复核放行根本身
        assert!(recheck_resolved(&safety, "/sdcard").is_err());
        assert!(recheck_resolved(&safety, "/storage").is_err());
        // 前缀防误伤
        assert!(recheck_resolved(&safety, "/sdcardevil").is_err());
    }
}
