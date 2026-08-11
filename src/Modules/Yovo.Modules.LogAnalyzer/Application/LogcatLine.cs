namespace Yovo.Modules.LogAnalyzer.Application;

/// <summary>logcat 行（不可变快照 — threadtime 格式解析结果；Raw 保留原文）</summary>
public sealed record LogcatLine(
    DateTimeOffset? Timestamp,
    string? Pid,
    string? Tid,
    string? Level,
    string? Tag,
    string Message,
    string Raw);
