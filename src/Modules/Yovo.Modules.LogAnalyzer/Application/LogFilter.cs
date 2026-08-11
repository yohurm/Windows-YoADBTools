namespace Yovo.Modules.LogAnalyzer.Application;

/// <summary>过滤条件（不可变快照 — VM 字段变化时构建新实例）</summary>
public sealed record LogFilterOptions(
    string? MinLevel,   // 最低级别（含以上）：V < D < I < W < E < F；null=全部
    string? Tag,        // Tag 包含（OrdinalIgnoreCase）
    string? Keyword,    // 消息/原文包含（OrdinalIgnoreCase，无正则）
    string? Pid);       // PID 包含（文本匹配，精确性由输入决定）

/// <summary>
/// 过滤管道（纯函数，可单测）— 对齐 Android Studio 语义：
///   pass = LevelMeetsMin && TagContains && KeywordContains && PidContains
/// 无正则引擎（模块决策：产线用包含匹配，不引查询 DSL）。
/// </summary>
public static class LogFilter
{
    private static readonly string[] LevelOrder = ["V", "D", "I", "W", "E", "F"];

    public static LogFilterOptions All => new(null, null, null, null);

    public static bool Matches(LogcatLine line, LogFilterOptions options)
    {
        if (options.MinLevel is { } min && !MeetsMinLevel(line.Level, min))
            return false;
        if (!string.IsNullOrWhiteSpace(options.Tag) &&
            !(line.Tag?.Contains(options.Tag.Trim(), StringComparison.OrdinalIgnoreCase) ?? false))
            return false;
        if (!string.IsNullOrWhiteSpace(options.Keyword) &&
            !line.Message.Contains(options.Keyword.Trim(), StringComparison.OrdinalIgnoreCase) &&
            !line.Raw.Contains(options.Keyword.Trim(), StringComparison.OrdinalIgnoreCase))
            return false;
        if (!string.IsNullOrWhiteSpace(options.Pid) &&
            !(line.Pid?.Contains(options.Pid.Trim(), StringComparison.Ordinal) ?? false))
            return false;
        return true;
    }

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
