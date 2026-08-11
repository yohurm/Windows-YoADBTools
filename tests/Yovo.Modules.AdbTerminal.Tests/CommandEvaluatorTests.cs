using Yovo.Modules.AdbTerminal.Application;
using Yovo.Modules.AdbTerminal.Domain;
using Xunit;

namespace Yovo.Modules.AdbTerminal.Tests;

/// <summary>成功判定策略（FailureRegex → SuccessRegex → 退出码）</summary>
public class CommandEvaluatorTests
{
    // ===== EvaluateSource：判定来源分离（M1） =====

    [Fact]
    public void EvaluateSource_marks_exit_code_failure_not_failure_regex()
    {
        // 无正则、仅退出码非 0 → ExitCode（不再误标 FailureRegex）
        Assert.Equal(ResultSource.ExitCode, CommandEvaluator.EvaluateSource("plain output", 1, null, null));
        Assert.Equal(ResultSource.ExitCode, CommandEvaluator.EvaluateSource("ok", 0, null, null));
        // FailureRegex 命中 → FailureRegex（即使退出码 0）
        Assert.Equal(ResultSource.FailureRegex, CommandEvaluator.EvaluateSource("error: bad", 0, null, "error"));
        // SuccessRegex 命中 → SuccessRegex（即使退出码非 0）
        Assert.Equal(ResultSource.SuccessRegex, CommandEvaluator.EvaluateSource("write ok", 255, "write ok", null));
        // Failure 优先于 Success
        Assert.Equal(ResultSource.FailureRegex, CommandEvaluator.EvaluateSource("error then ok", 0, "ok", "error"));
    }

    [Fact]
    public void FailureRegex_matches_first_even_with_exit_zero()
    {
        // 厂商工具：参数错误返回 0 但输出错误信息
        Assert.False(CommandEvaluator.Evaluate("Error: unknown option", 0, null, "error"));
    }

    [Fact]
    public void SuccessRegex_wins_even_with_nonzero_exit()
    {
        // bdft 等工具：成功返回 255 但输出正常
        Assert.True(CommandEvaluator.Evaluate("write ok", 255, "write ok", null));
    }

    [Fact]
    public void Exit_code_zero_means_success_without_regexes()
    {
        Assert.True(CommandEvaluator.Evaluate("", 0, null, null));
        Assert.False(CommandEvaluator.Evaluate("", 1, null, null));
    }

    [Fact]
    public void Failure_regex_beats_success_regex()
    {
        Assert.False(CommandEvaluator.Evaluate("error line then ok", 0, "ok", "error"));
    }

    [Fact]
    public void Invalid_regex_treated_as_no_match()
    {
        Assert.True(CommandEvaluator.Evaluate("any output", 0, "([invalid", "([invalid"));
    }

    [Fact]
    public void Regex_matching_is_case_insensitive()
    {
        Assert.True(CommandEvaluator.Evaluate("WRITE OK", 1, "write ok", null));
    }
}
