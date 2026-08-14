using System.Text.RegularExpressions;
using Yovo.Modules.AdbTerminal.Domain;

namespace Yovo.Modules.AdbTerminal.Application;

/// <summary>
/// 成功判定策略（领域规则，独立于进程层）：
/// 1. 输出匹配 FailureRegex → 失败（优先级最高，厂商工具"参数错误返回 0 但输出错误"）
/// 2. 输出匹配 SuccessRegex → 成功（厂商工具"成功返回 255 但输出正常"）
/// 3. 退出码为 0 → 成功
/// 判定（Evaluate）与来源（EvaluateSource）分离（M1）：失败不误标 FailureRegex。
/// </summary>
public static class CommandEvaluator
{
    public static bool Evaluate(string output, int exitCode, string? successRegex, string? failureRegex)
        => !IsRegexMatch(output, failureRegex) &&
           (IsRegexMatch(output, successRegex) || exitCode == 0);

    /// <summary>
    /// 判定来源（M1：失败分支不再一律标 FailureRegex）。
    /// 失败场景：FailureRegex 命中 → FailureRegex；否则（仅退出码非 0）→ ExitCode。
    /// 成功场景：SuccessRegex 命中 → SuccessRegex；否则 → ExitCode。
    /// </summary>
    public static ResultSource EvaluateSource(string output, int exitCode, string? successRegex, string? failureRegex)
    {
        if (IsRegexMatch(output, failureRegex))
            return ResultSource.FailureRegex;
        if (IsRegexMatch(output, successRegex))
            return ResultSource.SuccessRegex;
        return ResultSource.ExitCode;
    }

    /// <summary>正则匹配判定（忽略大小写，无效正则视为不匹配）</summary>
    private static bool IsRegexMatch(string output, string? regex)
    {
        if (string.IsNullOrEmpty(regex))
            return false;
        try
        {
            return Regex.IsMatch(output, regex, RegexOptions.IgnoreCase);
        }
        catch
        {
            return false; // 正则无效时视为不匹配
        }
    }
}
