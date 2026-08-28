//! 进程管理：spawn / 输出泵 / 终止进程树。
//!
//! 高内聚：只负责宿主进程生命周期与字节流，不做 adb 语义、不返回产品 wire。
//! stdout 与 stderr 必须同时泵取，否则大输出会填满管道造成死锁。
//! 取消/超时时必须先松开管道再 `wait`，否则子进程堵在写满的 pipe 上退不出去。

use std::ops::{Deref, DerefMut};
use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const STDOUT_BUDGET: usize = 8 * 1024 * 1024;
const STDERR_BUDGET: usize = 64 * 1024;
const REAP_WAIT: Duration = Duration::from_secs(3);

/// 短命令捕获结果。非零退出码仍是 `Ok`；超时/取消/IO 才是 `Err`。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// 宿主进程错误（不是 `AdbError`）。
#[derive(Debug, thiserror::Error)]
pub enum ProcessError {
    #[error("执行超时")]
    Timeout,
    #[error("任务已取消")]
    Cancelled,
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),
    #[error("执行失败(退出码 {exit_code}): {stderr}")]
    BadExit { exit_code: i32, stderr: String },
}

/// 终止整个进程树，并兜底 `start_kill` 主进程。
///
/// Windows：`taskkill /T /F`（不等待 taskkill 退出，避免堵住 tokio）。
/// Unix：子进程以新进程组启动，此处 `killpg`。
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
                .spawn();
        }
        #[cfg(unix)]
        {
            // spawn 时 process_group(0) → 负 pid 杀整组。
            // SAFETY: pid 来自当前 Child；负 pid 对 process_group(0) 启动的组发 SIGKILL。
            let _ = unsafe { libc::kill(-(pid as i32), libc::SIGKILL) };
        }
    }
    let _ = child.start_kill();
}

async fn reap(child: &mut Child) {
    kill_tree(child);
    if tokio::time::timeout(REAP_WAIT, child.wait()).await.is_err() {
        let _ = child.start_kill();
        let _ = tokio::time::timeout(REAP_WAIT, child.wait()).await;
    }
}

/// 长驻子进程句柄。`spawn_child` 的返回类型；可 `DerefMut` 到 [`Child`] 取管道。
pub struct ChildHandle {
    child: Child,
}

impl ChildHandle {
    fn wrap(child: Child) -> Self {
        Self { child }
    }

    pub fn pid(&self) -> Option<u32> {
        self.child.id()
    }

    pub fn kill_tree(&mut self) {
        kill_tree(&mut self.child);
    }

    pub async fn wait(&mut self) -> std::io::Result<std::process::ExitStatus> {
        self.child.wait().await
    }
}

impl Deref for ChildHandle {
    type Target = Child;
    fn deref(&self) -> &Child {
        &self.child
    }
}

impl DerefMut for ChildHandle {
    fn deref_mut(&mut self) -> &mut Child {
        &mut self.child
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
    ) -> Result<ProcessOutput, ProcessError> {
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
        let deadline = timeout.map(|t| tokio::time::Instant::now() + t);
        let out_timeout = async {
            match deadline {
                Some(d) => tokio::time::sleep_until(d).await,
                None => std::future::pending::<()>().await,
            }
        };
        let mut timeout_guard = Box::pin(out_timeout);

        loop {
            if stdout_done && stderr_done {
                break;
            }
            tokio::select! {
                biased;
                _ = cancel.cancelled() => {
                    drop(stdout_rx);
                    drop(stderr_rx);
                    for reader in readers {
                        reader.abort();
                    }
                    reap(&mut child).await;
                    return Err(ProcessError::Cancelled);
                }
                _ = &mut timeout_guard => {
                    drop(stdout_rx);
                    drop(stderr_rx);
                    for reader in readers {
                        reader.abort();
                    }
                    reap(&mut child).await;
                    return Err(ProcessError::Timeout);
                }
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

        let status = match deadline {
            Some(d) => match tokio::time::timeout_at(d, child.wait()).await {
                Ok(s) => s?,
                Err(_) => {
                    reap(&mut child).await;
                    return Err(ProcessError::Timeout);
                }
            },
            None => child.wait().await?,
        };

        Ok(ProcessOutput {
            exit_code: status.code().unwrap_or(-1),
            stdout: stdout_text,
            stderr: stderr_text,
        })
    }

    /// 流式命令：stdout 逐行经 `line_tx` 转发；非零退出为 [`ProcessError::BadExit`]。
    ///
    /// 计划稿曾写 `spawn_streaming`；实现名强调「跑到退出或取消」。
    pub async fn run_streaming(
        &self,
        program: &Path,
        args: &[String],
        cancel: CancellationToken,
        line_tx: mpsc::Sender<String>,
    ) -> Result<i32, ProcessError> {
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

        let mut stop: Option<ProcessError> = None;
        if let Some(stdout) = stdout {
            let mut lines = BufReader::new(stdout).lines();
            let mut stderr_done = stderr_rx.is_closed();
            loop {
                tokio::select! {
                    biased;
                    _ = cancel.cancelled() => {
                        stop = Some(ProcessError::Cancelled);
                        break;
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
                                tokio::select! {
                                    biased;
                                    _ = cancel.cancelled() => {
                                        stop = Some(ProcessError::Cancelled);
                                    }
                                    sent = line_tx.send(l) => {
                                        if sent.is_err() {
                                            stop = Some(ProcessError::Cancelled);
                                        }
                                    }
                                }
                                if stop.is_some() {
                                    break;
                                }
                            }
                            Ok(None) => break,
                            Err(e) => {
                                stop = Some(ProcessError::Io(e));
                                break;
                            }
                        }
                    }
                }
            }
        }

        if let Some(err) = stop {
            drop(stderr_rx);
            if let Some(task) = stderr_task.take() {
                task.abort();
            }
            reap(&mut child).await;
            return Err(err);
        }

        let status = child.wait().await?;
        if let Some(task) = stderr_task {
            let _ = task.await;
        }
        let exit_code = status.code().unwrap_or(-1);
        if exit_code != 0 {
            return Err(ProcessError::BadExit {
                exit_code,
                stderr: stderr_text,
            });
        }
        Ok(exit_code)
    }

    /// 启动长驻子进程：不捕获退出。调用方必须泵输出并在取消时 [`ChildHandle::kill_tree`]。
    pub fn spawn_child(
        &self,
        program: &Path,
        args: &[String],
    ) -> Result<ChildHandle, ProcessError> {
        Ok(ChildHandle::wrap(self.spawn(program, args)?))
    }

    fn spawn(&self, program: &Path, args: &[String]) -> Result<Child, ProcessError> {
        let mut cmd = Command::new(program);
        cmd.args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        #[cfg(unix)]
        cmd.process_group(0);
        cmd.spawn().map_err(ProcessError::Io)
    }
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn process_output_holds_nonzero_as_ok_payload() {
        let out = ProcessOutput {
            exit_code: 1,
            stdout: String::new(),
            stderr: "x".into(),
        };
        assert_eq!(out.exit_code, 1);
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn run_streaming_cancel_reaps_ping() {
        let runner = ProcessRunner;
        let cancel = CancellationToken::new();
        let (tx, mut rx) = mpsc::channel::<String>(8);
        let cancel_run = cancel.clone();
        let join = tokio::spawn(async move {
            runner
                .run_streaming(
                    Path::new("ping"),
                    &["-t".into(), "127.0.0.1".into()],
                    cancel_run,
                    tx,
                )
                .await
        });
        let _ = tokio::time::timeout(Duration::from_secs(2), rx.recv()).await;
        cancel.cancel();
        let finished = tokio::time::timeout(Duration::from_secs(8), join)
            .await
            .expect("取消后应收回 ping，不能握着 stdout 死等 wait");
        let err = finished.expect("join streaming task");
        assert!(matches!(err, Err(ProcessError::Cancelled)));
    }
}
