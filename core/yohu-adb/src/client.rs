//! ADB 客户端门面：组合 ToolResolver / ProcessRunner / 解析器。
//!
//! 职责边界：本层只做「调用 adb + 解析输出」，**不判定成败**（ADR-v6-009）。

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::{mpsc, Semaphore};
use tokio_util::sync::CancellationToken;

use crate::error::AdbError;
use crate::parse::{devices as devices_parse, ls as ls_parse, ps as ps_parse};
use crate::process::ProcessRunner;
use crate::tool::ToolResolver;
use yohu_protocol::{DeviceInfo, ExecOutcome, ProcessEntry, RemoteEntry};

/// 各 ADB 短命令超时（ms）——单源，避免业务分支散落魔法数。
const CLEAR_LOG_TIMEOUT_MS: u64 = 10_000;
const LIST_PS_TIMEOUT_MS: u64 = 15_000;
const DUMP_LOG_TIMEOUT_MS: u64 = 30_000;
const READLINK_TIMEOUT_MS: u64 = 10_000;

/// ADB 客户端。
pub struct AdbClient {
    /// 工具解析（adb.path 运行时更新 → 每次执行重新解析，立即生效）
    tool: ToolResolver,
    runner: ProcessRunner,
    /// ADB server 全局并发限流（短命令）
    limit: Arc<Semaphore>,
}

impl AdbClient {
    pub fn new(tool: ToolResolver, max_concurrency: usize) -> Self {
        Self {
            tool,
            runner: ProcessRunner,
            limit: Arc::new(Semaphore::new(max_concurrency.max(1))),
        }
    }

    /// 更新用户自定义 adb 路径（设置立即生效）。
    pub fn set_user_path(&self, path: Option<std::path::PathBuf>) {
        self.tool.set_user_path(path);
    }

    fn resolve_adb(&self) -> Result<std::path::PathBuf, AdbError> {
        self.tool.resolve()
    }

    /// 构造 argv（带设备前缀）。
    fn argv_with_serial(serial: &str, argv: &[String]) -> Vec<String> {
        let mut full = Vec::with_capacity(argv.len() + 2);
        if !serial.is_empty() {
            full.push("-s".into());
            full.push(serial.into());
        }
        full.extend(argv.iter().cloned());
        full
    }

    /// 短命令：捕获输出与退出码。
    pub async fn run(
        &self,
        serial: &str,
        argv: &[String],
        timeout_ms: Option<u64>,
        cancel: CancellationToken,
    ) -> Result<ExecOutcome, AdbError> {
        let _permit = self
            .limit
            .acquire()
            .await
            .map_err(|_| AdbError::Cancelled)?;
        let timeout = timeout_ms.map(Duration::from_millis);
        let adb = self.resolve_adb()?;
        self.runner
            .run_capture(&adb, &Self::argv_with_serial(serial, argv), timeout, cancel)
            .await
    }

    /// 长驻进程：不占短命令信号量；调用方负责泵输出与 [`crate::kill_tree`]。
    pub fn spawn_long_lived(
        &self,
        serial: &str,
        argv: &[String],
    ) -> Result<tokio::process::Child, AdbError> {
        let adb = self.resolve_adb()?;
        self.runner
            .spawn_child(&adb, &Self::argv_with_serial(serial, argv))
    }

    /// 流式命令：stdout 逐行转发（logcat 采集用）。
    pub async fn stream_lines(
        &self,
        serial: &str,
        argv: &[String],
        cancel: CancellationToken,
        line_tx: mpsc::Sender<String>,
    ) -> Result<i32, AdbError> {
        let adb = self.resolve_adb()?;
        self.runner
            .run_streaming(&adb, &Self::argv_with_serial(serial, argv), cancel, line_tx)
            .await
    }

    /// 扫描设备。
    pub async fn devices(&self, cancel: CancellationToken) -> Result<Vec<DeviceInfo>, AdbError> {
        let (devices, _used) = self.devices_resilient(cancel).await?;
        Ok(devices)
    }

    /// 自愈式设备扫描：按候选顺序尝试不同 adb（用户设置 → 资源目录 → 数据目录）。
    ///
    /// 任一候选「进程可启动且退出码 0」即采信其结果；失败的候选仅记录并尝试下一个。
    /// 全部失败时返回带明细的错误。返回 (设备列表, 实际使用的 adb 路径)。
    pub async fn devices_resilient(
        &self,
        cancel: CancellationToken,
    ) -> Result<(Vec<DeviceInfo>, PathBuf), AdbError> {
        let candidates = self.tool.candidates();
        if candidates.is_empty() {
            return Err(AdbError::ToolUnavailable(self.tool.unavailable_hint()));
        }
        let mut failures: Vec<String> = Vec::new();
        for adb in &candidates {
            if cancel.is_cancelled() {
                return Err(AdbError::Cancelled);
            }
            let result = self
                .runner
                .run_capture(
                    adb,
                    &["devices".into(), "-l".into()],
                    Some(Duration::from_secs(10)),
                    cancel.clone(),
                )
                .await;
            match result {
                Ok(out) if out.exit_code == 0 => {
                    return Ok((devices_parse::parse_devices_list(&out.stdout), adb.clone()));
                }
                Ok(out) => {
                    failures.push(format!("{} (退出码 {})", out.stderr.trim(), out.exit_code));
                    tracing::warn!(
                        "adb 候选失败 {}: {}",
                        adb.display(),
                        failures.last().unwrap_or(&String::new())
                    );
                }
                Err(e) => {
                    failures.push(e.to_string());
                    tracing::warn!("adb 候选不可用 {}: {e}", adb.display());
                }
            }
        }
        Err(AdbError::BadExit {
            exit_code: -1,
            stderr: format!(
                "全部 adb 候选扫描失败（{} 个）: {}",
                candidates.len(),
                failures.join("；")
            ),
        })
    }

    /// 清设备日志缓冲（`logcat -c`）。
    pub async fn clear_log(&self, serial: &str, cancel: CancellationToken) -> Result<(), AdbError> {
        let out = self
            .run(
                serial,
                &["logcat".into(), "-c".into()],
                Some(CLEAR_LOG_TIMEOUT_MS),
                cancel,
            )
            .await?;
        if out.exit_code != 0 {
            return Err(AdbError::BadExit {
                exit_code: out.exit_code,
                stderr: out.stderr,
            });
        }
        Ok(())
    }

    /// 一次性转储设备 logcat 缓冲（`logcat -d`），不跟流。
    /// 供 `yohu-logsrv::CaptureService::dump_into_ring`（拉历史缓冲）使用。
    pub async fn dump_log(
        &self,
        serial: &str,
        cancel: CancellationToken,
    ) -> Result<Vec<String>, AdbError> {
        let out = self
            .run(
                serial,
                &[
                    "logcat".into(),
                    "-d".into(),
                    "-v".into(),
                    "threadtime,uid".into(),
                ],
                Some(DUMP_LOG_TIMEOUT_MS),
                cancel,
            )
            .await?;
        if out.exit_code != 0 {
            return Err(AdbError::BadExit {
                exit_code: out.exit_code,
                stderr: out.stderr,
            });
        }
        Ok(out
            .stdout
            .lines()
            .filter(|line| !line.is_empty())
            .map(str::to_string)
            .collect())
    }

    /// 浏览设备目录。
    pub async fn ls(
        &self,
        serial: &str,
        path: &str,
        cancel: CancellationToken,
    ) -> Result<Vec<RemoteEntry>, AdbError> {
        let out = self
            .run(
                serial,
                &[
                    "shell".into(),
                    "ls".into(),
                    "-la".into(),
                    crate::shell_quote(path),
                ],
                Some(LIST_PS_TIMEOUT_MS),
                cancel,
            )
            .await?;
        if out.exit_code != 0 {
            return Err(AdbError::BadExit {
                exit_code: out.exit_code,
                stderr: out.stderr,
            });
        }
        Ok(ls_parse::parse_ls(&out.stdout))
    }

    /// 解析设备侧路径的规范路径（`adb shell readlink -f`）。用于符号链接逃逸守卫（ADR-v6-013）。
    ///
    /// 返回 `Ok(Some(canonical))` 当且仅当命令成功（退出码 0）且输出一条规范绝对路径；
    /// 返回 `Ok(None)` 表示「无法解析」：目标不存在、`readlink` 命令不可用、或输出为空。
    /// 调用方应把 `Ok(None)` 当作**保守放行**（词典校验已过，且 `/sdcard` 本身常为 symlink，
    /// 不能因解析不成功就阻断合法操作）。真正的执行层错误（设备掉线/超时）仍以 `Err` 返回。
    pub async fn readlink_f(
        &self,
        serial: &str,
        path: &str,
        cancel: CancellationToken,
    ) -> Result<Option<String>, AdbError> {
        let out = self
            .run(
                serial,
                &[
                    "shell".into(),
                    "readlink".into(),
                    "-f".into(),
                    crate::shell_quote(path),
                ],
                Some(READLINK_TIMEOUT_MS),
                cancel,
            )
            .await?;
        if out.exit_code != 0 {
            tracing::debug!(path = %path, stderr = %out.stderr, "readlink -f 未解析到规范路径");
            return Ok(None);
        }
        Ok(parse_readlink_f(&out.stdout))
    }

    /// 进程索引。
    pub async fn ps(
        &self,
        serial: &str,
        cancel: CancellationToken,
    ) -> Result<Vec<ProcessEntry>, AdbError> {
        let out = self
            .run(
                serial,
                &[
                    "shell".into(),
                    "ps".into(),
                    "-A".into(),
                    "-o".into(),
                    "PID,NAME".into(),
                ],
                Some(LIST_PS_TIMEOUT_MS),
                cancel,
            )
            .await?;
        if out.exit_code != 0 {
            return Err(AdbError::BadExit {
                exit_code: out.exit_code,
                stderr: out.stderr,
            });
        }
        Ok(ps_parse::parse_ps(&out.stdout))
    }
}

/// 解析 `readlink -f` 的 stdout 为规范路径。
///
/// 成功时输出单条绝对路径；空输出 / 非绝对路径首行视为「无法解析」，返回 `None`。
/// 纯函数（无 IO），便于对解析/接受逻辑做单元测试。
pub fn parse_readlink_f(stdout: &str) -> Option<String> {
    stdout
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && l.starts_with('/'))
        .map(str::to_string)
}

/// 实现 domain 执行端口（依赖倒置：适配层映射错误类型）。
impl yohu_domain::Runner for AdbClient {
    async fn run(
        &self,
        serial: &str,
        argv: Vec<String>,
        timeout_ms: Option<u64>,
        cancel: CancellationToken,
    ) -> Result<ExecOutcome, yohu_domain::RunError> {
        self.run(serial, &argv, timeout_ms, cancel)
            .await
            .map_err(Into::into)
    }
}

#[cfg(test)]
mod tests {
    use super::parse_readlink_f;

    #[test]
    fn readlink_f_parses_canonical_absolute_path() {
        assert_eq!(
            parse_readlink_f("/storage/emulated/0/DCIM\n"),
            Some("/storage/emulated/0/DCIM".into())
        );
        assert_eq!(
            parse_readlink_f("/storage/self/primary/DCIM\n"),
            Some("/storage/self/primary/DCIM".into())
        );
    }

    #[test]
    fn readlink_f_returns_none_for_empty_or_non_absolute_output() {
        assert_eq!(parse_readlink_f(""), None);
        assert_eq!(parse_readlink_f("\n\n"), None);
        assert_eq!(parse_readlink_f("relative/path\n"), None);
        // 目标不存在时 readlink 无 stdout（错误在 stderr）
        assert_eq!(parse_readlink_f(""), None);
    }

    #[test]
    fn readlink_f_skips_leading_blank_lines() {
        assert_eq!(
            parse_readlink_f("\n/data/local/tmp/foo\n"),
            Some("/data/local/tmp/foo".into())
        );
    }
}
