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
use yovo_protocol::{DeviceInfo, ExecOutcome, ProcessEntry, RemoteEntry};

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
        let _permit = self.limit.acquire().await.map_err(|_| AdbError::Cancelled)?;
        let timeout = timeout_ms.map(Duration::from_millis);
        let adb = self.resolve_adb()?;
        self.runner
            .run_capture(&adb, &Self::argv_with_serial(serial, argv), timeout, cancel)
            .await
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
                    tracing::warn!("adb 候选失败 {}: {}", adb.display(), failures.last().unwrap_or(&String::new()));
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
            .run(serial, &["logcat".into(), "-c".into()], Some(10_000), cancel)
            .await?;
        if out.exit_code != 0 {
            return Err(AdbError::BadExit { exit_code: out.exit_code, stderr: out.stderr });
        }
        Ok(())
    }

    /// 一次性转储设备 logcat 缓冲（`logcat -d`），不跟流。
    ///
    /// 预留给后续「拉历史缓冲」能力；当前 UI 不调用。
    pub async fn dump_log(&self, serial: &str, cancel: CancellationToken) -> Result<Vec<String>, AdbError> {
        let out = self
            .run(
                serial,
                &["logcat".into(), "-d".into(), "-v".into(), "threadtime,uid".into()],
                Some(30_000),
                cancel,
            )
            .await?;
        if out.exit_code != 0 {
            return Err(AdbError::BadExit { exit_code: out.exit_code, stderr: out.stderr });
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
            .run(serial, &["shell".into(), "ls".into(), "-la".into(), path.into()], Some(15_000), cancel)
            .await?;
        if out.exit_code != 0 {
            return Err(AdbError::BadExit { exit_code: out.exit_code, stderr: out.stderr });
        }
        Ok(ls_parse::parse_ls(&out.stdout))
    }

    /// 进程索引。
    pub async fn ps(&self, serial: &str, cancel: CancellationToken) -> Result<Vec<ProcessEntry>, AdbError> {
        let out = self
            .run(
                serial,
                &["shell".into(), "ps".into(), "-A".into(), "-o".into(), "PID,NAME".into()],
                Some(15_000),
                cancel,
            )
            .await?;
        if out.exit_code != 0 {
            return Err(AdbError::BadExit { exit_code: out.exit_code, stderr: out.stderr });
        }
        Ok(ps_parse::parse_ps(&out.stdout))
    }
}

/// 实现 domain 执行端口（依赖倒置：适配层映射错误类型）。
impl yovo_domain::Runner for AdbClient {
    async fn run(
        &self,
        serial: &str,
        argv: Vec<String>,
        timeout_ms: Option<u64>,
        cancel: CancellationToken,
    ) -> Result<ExecOutcome, yovo_domain::RunError> {
        self.run(serial, &argv, timeout_ms, cancel).await.map_err(Into::into)
    }
}
