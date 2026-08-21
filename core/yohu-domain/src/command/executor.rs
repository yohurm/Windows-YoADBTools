//! 命令组编排：多设备并行、组内串行、延时、失败中断。
//!
//! 执行能力经 [`Runner`] 端口注入（yohu-adb 实现），本层不做进程 IO —— 可单测。
//! 依赖倒置：端口与其错误类型都定义在 domain，适配层（yohu-adb）负责映射。

use std::future::Future;
use std::sync::Arc;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use super::library::CommandDefinition;
use super::{CommandEvaluator, Verdict};
use yohu_protocol::ExecOutcome;

/// 执行端口错误（domain 自有类型；适配层映射）。
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum RunError {
    #[error("设备掉线: {0}")]
    DeviceOffline(String),
    #[error("设备未授权")]
    Unauthorized,
    #[error("执行超时")]
    Timeout,
    #[error("已取消")]
    Cancelled,
    #[error("执行失败: {0}")]
    Adb(String),
}

/// 命令执行端口（由 yohu-adb 的 `AdbClient` 实现）。
pub trait Runner: Send + Sync + 'static {
    fn run(
        &self,
        serial: &str,
        argv: Vec<String>,
        timeout_ms: Option<u64>,
        cancel: CancellationToken,
    ) -> impl Future<Output = Result<ExecOutcome, RunError>> + Send;
}

/// 共享引用自动实现端口（`Arc<AdbClient>: Runner`）。
impl<T: Runner + ?Sized> Runner for Arc<T> {
    async fn run(
        &self,
        serial: &str,
        argv: Vec<String>,
        timeout_ms: Option<u64>,
        cancel: CancellationToken,
    ) -> Result<ExecOutcome, RunError> {
        (**self).run(serial, argv, timeout_ms, cancel).await
    }
}

/// 单命令：拆行 → 执行 → 领域判定。`RunError` 原样上抛（映射由壳完成）。
pub async fn run_and_evaluate<R: Runner>(
    runner: &R,
    serial: &str,
    command: &CommandDefinition,
    cancel: CancellationToken,
) -> Result<EvaluatedRun, RunError> {
    let argv = split_command_line(&command.template);
    let started = std::time::Instant::now();
    let outcome = runner.run(serial, argv, None, cancel).await?;
    let duration_ms = started.elapsed().as_millis() as u64;
    let verdict = CommandEvaluator::evaluate(command, &outcome);
    Ok(EvaluatedRun {
        outcome,
        verdict,
        duration_ms,
    })
}

/// 单命令执行 + 判定结果。
#[derive(Debug, Clone, PartialEq)]
pub struct EvaluatedRun {
    pub outcome: ExecOutcome,
    pub verdict: Verdict,
    pub duration_ms: u64,
}

impl EvaluatedRun {
    pub fn into_eval_result(self) -> yohu_protocol::EvalResult {
        let (ok, message) = match self.verdict {
            Verdict::Pass => (true, String::new()),
            Verdict::Fail { reason } => (false, reason),
        };
        yohu_protocol::EvalResult {
            ok,
            message,
            exit_code: self.outcome.exit_code,
            stdout: self.outcome.stdout,
            stderr: self.outcome.stderr,
            duration_ms: self.duration_ms,
        }
    }
}

/// 组执行进度事件（每命令一条）。
#[derive(Debug, Clone)]
pub struct GroupRunEvent {
    pub serial: String,
    /// 命令名（展示用）
    pub name: String,
    /// 组内命令序号（0 起）
    pub command_index: usize,
    pub total: usize,
    pub verdict: Verdict,
    pub message: String,
    /// 单命令用时（毫秒）
    pub duration_ms: u64,
}

/// 组执行编排器（无状态，可复用）。
pub struct GroupExecutor<R: Runner> {
    runner: Arc<R>,
}

impl<R: Runner> GroupExecutor<R> {
    pub fn new(runner: R) -> Self {
        Self {
            runner: Arc::new(runner),
        }
    }

    /// 对每个设备并行执行整组命令；组内串行，支持延时与失败中断。
    /// 进度经 `progress_tx` 推送；`cancel` 取消整个运行。
    pub async fn run(
        &self,
        group: &[CommandDefinition],
        serials: &[String],
        progress_tx: mpsc::Sender<GroupRunEvent>,
        cancel: CancellationToken,
    ) {
        let mut joins = Vec::with_capacity(serials.len());
        for serial in serials {
            let group = group.to_vec();
            let runner = Arc::clone(&self.runner);
            let tx = progress_tx.clone();
            let cancel = cancel.clone();
            let serial = serial.clone();
            joins.push(tokio::spawn(async move {
                let executor = GroupExecutor { runner };
                executor.run_for_device(&group, &serial, tx, cancel).await;
            }));
        }
        for j in joins {
            let _ = j.await;
        }
    }

    async fn run_for_device(
        &self,
        group: &[CommandDefinition],
        serial: &str,
        progress_tx: mpsc::Sender<GroupRunEvent>,
        cancel: CancellationToken,
    ) {
        let total = group.len();
        for (index, command) in group.iter().enumerate() {
            if cancel.is_cancelled() {
                return;
            }
            if command.delay_ms > 0 {
                tokio::select! {
                    _ = tokio::time::sleep(std::time::Duration::from_millis(command.delay_ms)) => {}
                    _ = cancel.cancelled() => return,
                }
            }
            let started = std::time::Instant::now();
            let (verdict, message, duration_ms) =
                match run_and_evaluate(&*self.runner, serial, command, cancel.clone()).await {
                    Ok(evaluated) => {
                        let message = if evaluated.outcome.stderr.is_empty() {
                            evaluated.outcome.stdout
                        } else {
                            evaluated.outcome.stderr
                        };
                        (evaluated.verdict, message, evaluated.duration_ms)
                    }
                    Err(e) => (
                        Verdict::Fail {
                            reason: e.to_string(),
                        },
                        e.to_string(),
                        started.elapsed().as_millis() as u64,
                    ),
                };
            let abort = command.abort_on_fail && !verdict.is_pass();
            let _ = progress_tx.try_send(GroupRunEvent {
                serial: serial.to_string(),
                name: command.name.clone(),
                command_index: index,
                total,
                verdict,
                message,
                duration_ms,
            });
            if abort {
                return;
            }
        }
    }
}

/// 按引号规则拆分命令行（双引号分组、反斜杠转义双引号）。
///
/// 例：`shell "echo hello world" getprop` → `["shell", "echo hello world", "getprop"]`
pub fn split_command_line(input: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = input.chars().peekable();

    while let Some(c) = chars.next() {
        match c {
            '"' => in_quotes = !in_quotes,
            '\\' if chars.peek() == Some(&'"') => {
                chars.next();
                current.push('"');
            }
            ' ' | '\t' if !in_quotes => {
                if !current.is_empty() {
                    args.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(c),
        }
    }
    if !current.is_empty() {
        args.push(current);
    }
    args
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[test]
    fn split_plain() {
        assert_eq!(
            split_command_line("shell getprop ro.build.version"),
            vec!["shell", "getprop", "ro.build.version"]
        );
    }

    #[test]
    fn split_quoted_keeps_spaces() {
        assert_eq!(
            split_command_line(r#"shell "echo hello world" getprop"#),
            vec!["shell", "echo hello world", "getprop"]
        );
    }

    #[test]
    fn split_escaped_quote() {
        assert_eq!(split_command_line(r#"shell "a\"b""#), vec!["shell", "a\"b"]);
    }

    #[test]
    fn split_empty() {
        assert!(split_command_line("   ").is_empty());
    }

    // ===== 编排逻辑（用假 Runner 单测） =====

    struct FakeRunner {
        /// 记录调用顺序（serial, argv）
        calls: Mutex<Vec<(String, Vec<String>)>>,
        /// 每个命令的退出码队列
        exit_codes: Mutex<Vec<i32>>,
    }

    impl Runner for FakeRunner {
        async fn run(
            &self,
            serial: &str,
            argv: Vec<String>,
            _timeout_ms: Option<u64>,
            _cancel: CancellationToken,
        ) -> Result<ExecOutcome, RunError> {
            let code = self.exit_codes.lock().unwrap().remove(0);
            self.calls.lock().unwrap().push((serial.to_string(), argv));
            Ok(ExecOutcome {
                exit_code: code,
                stdout: String::new(),
                stderr: String::new(),
            })
        }
    }

    fn command(id: &str, template: &str, abort: bool) -> CommandDefinition {
        CommandDefinition {
            id: id.into(),
            name: id.into(),
            template: template.into(),
            inputs: vec![],
            failure_regex: String::new(),
            success_regex: String::new(),
            delay_ms: 0,
            abort_on_fail: abort,
        }
    }

    #[tokio::test]
    async fn parallel_per_device_sequential_within() {
        let runner = FakeRunner {
            calls: Mutex::new(vec![]),
            exit_codes: Mutex::new(vec![0, 0, 0, 0]),
        };
        let executor = GroupExecutor::new(runner);
        let group = vec![command("a", "echo a", true), command("b", "echo b", true)];
        let (tx, mut rx) = mpsc::channel(16);

        executor
            .run(
                &group,
                &["s1".into(), "s2".into()],
                tx,
                CancellationToken::new(),
            )
            .await;

        let mut events = Vec::new();
        while let Ok(e) = rx.try_recv() {
            events.push(e);
        }
        assert_eq!(events.len(), 4);
        let calls = {
            // 通过事件验证每设备 2 命令均 Pass
            assert!(events.iter().all(|e| e.verdict.is_pass()));
            let fake = &executor.runner;
            fake.calls.lock().unwrap().clone()
        };
        assert_eq!(calls.len(), 4);
        assert_eq!(calls.iter().filter(|c| c.0 == "s1").count(), 2);
        assert_eq!(calls.iter().filter(|c| c.0 == "s2").count(), 2);
    }

    #[tokio::test]
    async fn abort_on_fail_stops_remaining_commands() {
        let runner = FakeRunner {
            calls: Mutex::new(vec![]),
            exit_codes: Mutex::new(vec![1, 0]), // 第一条失败 → 第二条不执行
        };
        let executor = GroupExecutor::new(runner);
        let group = vec![command("a", "echo a", true), command("b", "echo b", true)];
        let (tx, mut rx) = mpsc::channel(16);

        executor
            .run(&group, &["s1".into()], tx, CancellationToken::new())
            .await;

        let mut events = Vec::new();
        while let Ok(e) = rx.try_recv() {
            events.push(e);
        }
        assert_eq!(events.len(), 1);
        assert!(matches!(events[0].verdict, Verdict::Fail { .. }));
    }

    #[tokio::test]
    async fn no_abort_when_abort_on_fail_false() {
        let runner = FakeRunner {
            calls: Mutex::new(vec![]),
            exit_codes: Mutex::new(vec![1, 0]),
        };
        let executor = GroupExecutor::new(runner);
        let group = vec![command("a", "echo a", false), command("b", "echo b", true)];
        let (tx, mut rx) = mpsc::channel(16);

        executor
            .run(&group, &["s1".into()], tx, CancellationToken::new())
            .await;

        let mut events = Vec::new();
        while let Ok(e) = rx.try_recv() {
            events.push(e);
        }
        assert_eq!(events.len(), 2);
    }

    #[tokio::test]
    async fn cancel_stops_execution() {
        let runner = FakeRunner {
            calls: Mutex::new(vec![]),
            exit_codes: Mutex::new(vec![0, 0]),
        };
        let executor = GroupExecutor::new(runner);
        let group = vec![command("a", "echo a", true), command("b", "echo b", true)];
        let (tx, mut rx) = mpsc::channel(16);
        let cancel = CancellationToken::new();
        cancel.cancel(); // 一开始就取消 → 无事件

        executor.run(&group, &["s1".into()], tx, cancel).await;
        assert!(rx.try_recv().is_err());
    }

    #[tokio::test]
    async fn run_and_evaluate_maps_exit_code() {
        let runner = FakeRunner {
            calls: Mutex::new(vec![]),
            exit_codes: Mutex::new(vec![0]),
        };
        let evaluated = run_and_evaluate(
            &runner,
            "s1",
            &command("a", "echo a", true),
            CancellationToken::new(),
        )
        .await
        .unwrap();
        assert!(evaluated.verdict.is_pass());
        assert_eq!(evaluated.outcome.exit_code, 0);
        let wire = evaluated.into_eval_result();
        assert!(wire.ok);
        assert_eq!(wire.exit_code, 0);
    }
}
