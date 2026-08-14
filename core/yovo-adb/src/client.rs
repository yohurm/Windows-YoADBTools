//! ADB 客户端门面：组合 ToolResolver / ProcessRunner / 解析器。
//!
//! 职责边界：本层只做「调用 adb + 解析输出」，**不判定成败**（ADR-v6-009）。

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
        let out = self.run("", &["devices".into(), "-l".into()], Some(10_000), cancel).await?;
        if out.exit_code != 0 {
            return Err(AdbError::BadExit { exit_code: out.exit_code, stderr: out.stderr });
        }
        Ok(devices_parse::parse_devices_list(&out.stdout))
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
