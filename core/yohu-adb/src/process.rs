//! 进程管理：spawn / 输出泵 / 终止进程树（Windows taskkill）。
//!
//! 高内聚：本模块只负责「进程生命周期与字节流」，不做 adb 语义。
//! 并发要点：stdout 与 stderr 必须**同时**泵取，否则大输出会填满管道造成死锁。

use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::error::AdbError;
use yohu_protocol::ExecOutcome;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// stdout 收集上限（防止异常命令刷爆内存）。
const STDOUT_BUDGET: usize = 8 * 1024 * 1024;
/// stderr 收集上限（仅用于结局诊断）。
const STDERR_BUDGET: usize = 64 * 1024;

/// 终止整个进程树（Windows：`taskkill /T /F`）并兜底 kill 主进程。
/// 自由函数形式：可作用于裸 [`Child`]（run_capture/run_streaming 内部使用）。
pub fn kill_tree(child: &mut Child) {
    if let Some(pid) = child.id() {
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .creation_flags(CREATE_NO_WINDOW)
                .status();
        }
    }
    let _ = child.start_kill();
}

/// 子进程句柄：支持「终止进程树」的取消语义。
pub struct ChildHandle {
    child: Child,
}

impl ChildHandle {
    pub fn pid(&self) -> Option<u32> {
        self.child.id()
    }

    /// 终止整个进程树（Windows：`taskkill /T /F`）并兜底 kill 主进程。
    pub fn kill_tree(&mut self) {
        kill_tree(&mut self.child);
    }

    pub async fn wait(&mut self) -> std::io::Result<std::process::ExitStatus> {
        self.child.wait().await
    }
}

/// 进程运行器（无状态）。
#[derive(Default)]
pub struct ProcessRunner;

impl ProcessRunner {
    /// 运行短命令：捕获 stdout/stderr 与退出码；`cancel` 触发进程树终止。
    pub async fn run_capture(
        &self,
        program: &Path,
        args: &[String],
        timeout: Option<Duration>,
        cancel: CancellationToken,
    ) -> Result<ExecOutcome, AdbError> {
        let mut child = self.spawn(program, args)?;
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let (stdout_tx, mut stdout_rx) = mpsc::channel::<String>(128);
        let (stderr_tx, mut stderr_rx) = mpsc::channel::<String>(128);
        let mut readers = Vec::new();
        if let Some(out) = stdout {
            readers.push(tokio::spawn(read_lines_bounded(
                out,
                stdout_tx,
                STDOUT_BUDGET,
            )));
        }
        if let Some(err) = stderr {
            readers.push(tokio::spawn(read_lines_bounded(
                err,
                stderr_tx,
                STDERR_BUDGET,
            )));
        }

        let mut stdout_text = String::new();
        let mut stderr_text = String::new();
        let mut stdout_done = stdout_rx.is_closed();
        let mut stderr_done = stderr_rx.is_closed();

        loop {
            if stdout_done && stderr_done {
                break;
            }
            tokio::select! {
                biased;
                _ = cancel.cancelled() => {
                    kill_tree(&mut child);
                    let _ = child.wait().await;
                    return Err(AdbError::Cancelled);
                }
                // 关键：通道关闭后必须禁用分支（否则恒就绪 → 忙循环饿死另一读任务）
                chunk = stdout_rx.recv(), if !stdout_done => {
                    match chunk {
                        Some(c) => stdout_text.push_str(&c),
                        None => stdout_done = true,
                    }
                }
                chunk = stderr_rx.recv(), if !stderr_done => {
                    match chunk {
                        Some(c) => stderr_text.push_str(&c),
                        None => stderr_done = true,
                    }
                }
            }
        }
        for reader in readers {
            let _ = reader.await;
        }

        let status = match timeout {
            Some(t) => tokio::select! {
                s = child.wait() => s?,
                _ = tokio::time::sleep(t) => {
                    kill_tree(&mut child);
                    let _ = child.wait().await;
                    return Err(AdbError::Timeout);
                }
            },
            None => child.wait().await?,
        };

        let exit_code = status.code().unwrap_or(-1);
        if exit_code != 0 && is_device_offline(&stderr_text) {
            return Err(AdbError::DeviceOffline(stderr_text.trim().to_string()));
        }
        Ok(ExecOutcome {
            exit_code,
            stdout: stdout_text,
            stderr: stderr_text,
        })
    }

    /// 运行流式命令：stdout 逐行经 `line_tx` 转发；返回最终退出码（正常退出）。
    pub async fn run_streaming(
        &self,
        program: &Path,
        args: &[String],
        cancel: CancellationToken,
        line_tx: mpsc::Sender<String>,
    ) -> Result<i32, AdbError> {
        let mut child = self.spawn(program, args)?;
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let (stderr_tx, mut stderr_rx) = mpsc::channel::<String>(64);
        let mut stderr_task = None;
        let mut stderr_text = String::new();
        if let Some(err) = stderr {
            stderr_task = Some(tokio::spawn(read_lines_bounded(
                err,
                stderr_tx,
                STDERR_BUDGET,
            )));
        }

        if let Some(stdout) = stdout {
            let mut lines = BufReader::new(stdout).lines();
            let mut stderr_done = stderr_rx.is_closed();
            loop {
                if stderr_done {
                    // stderr 已关：只等 stdout 行（避免关闭通道分支恒就绪导致忙循环）
                    match lines.next_line().await {
                        Ok(Some(l)) => {
                            if line_tx.send(l).await.is_err() {
                                kill_tree(&mut child);
                                let _ = child.wait().await;
                                return Err(AdbError::Cancelled);
                            }
                        }
                        Ok(None) => break,
                        Err(e) => return Err(AdbError::Io(e)),
                    }
                    if cancel.is_cancelled() {
                        kill_tree(&mut child);
                        let _ = child.wait().await;
                        return Err(AdbError::Cancelled);
                    }
                    continue;
                }
                tokio::select! {
                    biased;
                    _ = cancel.cancelled() => {
                        kill_tree(&mut child);
                        let _ = child.wait().await;
                        return Err(AdbError::Cancelled);
                    }
                    chunk = stderr_rx.recv(), if !stderr_done => {
                        match chunk {
                            Some(c) => stderr_text.push_str(&c),
                            None => stderr_done = true,
                        }
                    }
                    line = lines.next_line() => {
                        match line {
                            Ok(Some(l)) => {
                                if line_tx.send(l).await.is_err() {
                                    kill_tree(&mut child);
                                    let _ = child.wait().await;
                                    return Err(AdbError::Cancelled);
                                }
                            }
                            Ok(None) => break,
                            Err(e) => return Err(AdbError::Io(e)),
                        }
                    }
                }
            }
        }

        let status = child.wait().await?;
        if let Some(task) = stderr_task {
            let _ = task.await;
        }
        let exit_code = status.code().unwrap_or(-1);
        if exit_code != 0 && is_device_offline(&stderr_text) {
            return Err(AdbError::DeviceOffline(stderr_text.trim().to_string()));
        }
        Ok(exit_code)
    }

    /// 启动长驻子进程（投屏 `app_process`）：不捕获退出、不占短命令信号量。
    /// 调用方必须同时泵 stdout/stderr，并在取消时 [`kill_tree`]。
    pub fn spawn_child(&self, program: &Path, args: &[String]) -> Result<Child, AdbError> {
        self.spawn(program, args)
    }

    fn spawn(&self, program: &Path, args: &[String]) -> Result<Child, AdbError> {
        let mut cmd = Command::new(program);
        cmd.args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.spawn().map_err(AdbError::Io)
    }
}

/// 逐行读取至有界缓冲；每行以 `\n` 结尾转发；超出预算后继续读但不转发（防管道阻塞）。
async fn read_lines_bounded<R>(reader: R, tx: mpsc::Sender<String>, max_bytes: usize)
where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut lines = BufReader::new(reader).lines();
    let mut budget = max_bytes;
    while let Ok(Some(line)) = lines.next_line().await {
        let mut line = line;
        line.push('\n');
        if budget == 0 {
            continue;
        }
        if line.len() > budget {
            let cut: String = line.chars().take(budget).collect();
            budget = 0;
            let _ = tx.send(cut).await;
        } else {
            budget = budget.saturating_sub(line.len());
            let _ = tx.send(line).await;
        }
    }
}

/// adb 掉线/无设备特征（stderr 判定）。
fn is_device_offline(stderr: &str) -> bool {
    let lower = stderr.to_lowercase();
    [
        "device offline",
        "device not found",
        "no devices/emulators found",
        "device 'offline'",
    ]
    .iter()
    .any(|k| lower.contains(k))
}
