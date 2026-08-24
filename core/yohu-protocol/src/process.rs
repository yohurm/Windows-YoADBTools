//! 进程执行结果。ADB 客户端**不判定成败**（ADR-slint-009），只如实上报。

use serde::{Deserialize, Serialize};

/// 一次短命令执行的原始结果。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExecOutcome {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}
