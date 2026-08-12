namespace Yovo.Modules.LogAnalyzer.Application;

/// <summary>过滤条件（不可变快照 — 由 LogSession.BuildFilter 组装）</summary>
public sealed record LogFilterOptions(
    string? MinLevel,                       // 最低级别（含以上）：V < D < I < W < E < F；null=全部
    string? Tag,                            // Tag 包含（OrdinalIgnoreCase）
    string? Keyword,                        // 消息/原文包含（OrdinalIgnoreCase，无正则）
    SessionScope Scope = SessionScope.All,  // 会话作用域（多窗划分）
    string? ExactPid = null,                // Pid 作用域：精确相等（ADR-LA-007）
    IReadOnlySet<string>? PidSet = null);   // Package 作用域：绑定∪历史 PID 集合

/// <summary>
/// 过滤管道（纯函数，可单测）— 对齐 Android Studio 语义（ADR-LA-003）：
///   pass = MeetsScope && LevelMeetsMin && TagContains && KeywordContains
/// 无正则引擎（模块决策：产线用包含匹配，不引查询 DSL）。
/// </summary>
public static class LogFilter
{
    private static readonly string[] LevelOrder = ["V", "D", "I", "W", "E", "F"];

    public static LogFilterOptions All => new(null, null, null);

    public static bool Matches(LogcatLine line, LogFilterOptions options)
    {
        if (!MeetsScope(line, options))
            return false;
        if (options.MinLevel is { } min && !MeetsMinLevel(line.Level, min))
            return false;
        if (!string.IsNullOrWhiteSpace(options.Tag) &&
            !(line.Tag?.Contains(options.Tag.Trim(), StringComparison.OrdinalIgnoreCase) ?? false))
            return false;
        if (!string.IsNullOrWhiteSpace(options.Keyword) &&
            !line.Message.Contains(options.Keyword.Trim(), StringComparison.OrdinalIgnoreCase) &&
            !line.Raw.Contains(options.Keyword.Trim(), StringComparison.OrdinalIgnoreCase))
            return false;
        return true;
    }

    /// <summary>作用域匹配：All 恒真；Pid 精确相等；Package 属于 PidSet（含历史，调用方已合并）</summary>
    private static bool MeetsScope(LogcatLine line, LogFilterOptions options)
        => options.Scope switch
        {
            SessionScope.All => true,
            SessionScope.Pid => line.Pid == options.ExactPid,
            SessionScope.Package => line.Pid is { } pid && options.PidSet is { } set && set.Contains(pid),
            _ => true,
        };

    /// <summary>最低级别（含以上）：选中 W 则 W/E/F 通过</summary>
    public static bool MeetsMinLevel(string? lineLevel, string minLevel)
    {
        if (string.IsNullOrEmpty(lineLevel))
            return false;
        var lineIdx = Array.IndexOf(LevelOrder, lineLevel);
        var minIdx = Array.IndexOf(LevelOrder, minLevel);
        if (lineIdx < 0 || minIdx < 0)
            return lineLevel == minLevel;
        return lineIdx >= minIdx;
    }

    /// <summary>当前过滤条件下命中关键字的行（F24 高亮用；空关键字返回 false）</summary>
    public static bool KeywordHit(LogcatLine line, string? keyword)
        => !string.IsNullOrWhiteSpace(keyword) &&
           line.Message.Contains(keyword.Trim(), StringComparison.OrdinalIgnoreCase);
}
