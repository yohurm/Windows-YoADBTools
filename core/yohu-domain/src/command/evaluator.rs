//! 成败判定（ADR-v6-009）：**失败正则 → 成功正则 → 退出码**。
//!
//! ADB 客户端不判定成败；判定只发生在本领域层。

use regex::Regex;

use super::CommandDefinition;
use yohu_protocol::ExecOutcome;

/// 判定结论。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Verdict {
    Pass,
    Fail { reason: String },
}

impl Verdict {
    pub fn is_pass(&self) -> bool {
        matches!(self, Verdict::Pass)
    }
}

/// 纯静态判定器。
pub struct CommandEvaluator;

impl CommandEvaluator {
    /// 判定顺序：失败正则命中 → Fail；否则若配置成功正则 →
    /// 命中 Pass / 未命中 Fail；否则退出码 0 → Pass，非 0 → Fail。
    ///
    /// 正则在库校验（`validate`）时已保证有效；若此处仍编译失败（数据被绕过校验），
    /// 视为该命令判定不可信，一律判 Fail，避免「非法正则被静默降级为不配置 → 假 Pass」。
    pub fn evaluate(def: &CommandDefinition, outcome: &ExecOutcome) -> Verdict {
        let combined = format!("{}\n{}", outcome.stdout, outcome.stderr);

        if !def.failure_regex.is_empty() {
            match Self::compile(&def.failure_regex) {
                Ok(Some(re)) if re.is_match(&combined) => {
                    return Verdict::Fail {
                        reason: format!("输出匹配失败正则: {}", def.failure_regex),
                    };
                }
                Ok(_) => {}
                Err(_) => {
                    return Verdict::Fail {
                        reason: format!("失败正则无效: {}", def.failure_regex),
                    };
                }
            }
        }
        if !def.success_regex.is_empty() {
            return match Self::compile(&def.success_regex) {
                Ok(Some(re)) if re.is_match(&combined) => Verdict::Pass,
                Ok(_) => Verdict::Fail {
                    reason: format!("输出未匹配成功正则: {}", def.success_regex),
                },
                Err(_) => Verdict::Fail {
                    reason: format!("成功正则无效: {}", def.success_regex),
                },
            };
        }
        if outcome.exit_code == 0 {
            Verdict::Pass
        } else {
            Verdict::Fail {
                reason: format!("退出码 {}", outcome.exit_code),
            }
        }
    }

    /// 空模式返回 `Ok(None)`（=不配置）；非空模式编译失败返回 `Err`。
    fn compile(pattern: &str) -> Result<Option<Regex>, String> {
        if pattern.is_empty() {
            return Ok(None);
        }
        Regex::new(pattern).map(Some).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn def(failure: &str, success: &str) -> CommandDefinition {
        CommandDefinition {
            id: "c1".into(),
            name: "t".into(),
            template: "echo".into(),
            inputs: vec![],
            failure_regex: failure.into(),
            success_regex: success.into(),
            delay_ms: 0,
            abort_on_fail: true,
        }
    }

    fn outcome(exit: i32, stdout: &str, stderr: &str) -> ExecOutcome {
        ExecOutcome {
            exit_code: exit,
            stdout: stdout.into(),
            stderr: stderr.into(),
        }
    }

    #[test]
    fn exit_code_zero_passes_without_regex() {
        assert_eq!(
            CommandEvaluator::evaluate(&def("", ""), &outcome(0, "ok", "")),
            Verdict::Pass
        );
    }

    #[test]
    fn non_zero_exit_fails_without_regex() {
        let v = CommandEvaluator::evaluate(&def("", ""), &outcome(1, "", "boom"));
        assert!(matches!(v, Verdict::Fail { reason } if reason.contains("退出码 1")));
    }

    #[test]
    fn failure_regex_beats_success_and_exit_code() {
        // 失败正则命中 → Fail，即使退出码 0 且成功正则也命中
        let v = CommandEvaluator::evaluate(
            &def("FAILURE|error", "ok"),
            &outcome(0, "this is an error", ""),
        );
        assert!(matches!(v, Verdict::Fail { reason } if reason.contains("失败正则")));
    }

    #[test]
    fn success_regex_gates_exit_code() {
        // 成功正则未命中 → Fail，即使退出码 0
        let v = CommandEvaluator::evaluate(&def("", "expected-marker"), &outcome(0, "nope", ""));
        assert!(matches!(v, Verdict::Fail { reason } if reason.contains("成功正则")));

        let v = CommandEvaluator::evaluate(
            &def("", "expected-marker"),
            &outcome(0, "expected-marker", ""),
        );
        assert_eq!(v, Verdict::Pass);
    }
}
