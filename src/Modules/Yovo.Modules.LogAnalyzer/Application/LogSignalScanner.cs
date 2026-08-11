namespace Yovo.Modules.LogAnalyzer.Application;

/// <summary>
/// 崩溃/异常粗信号扫描（F26）— 消息特征匹配，不改 Raw。
/// 覆盖产线最常见的三类：Java 崩溃（FATAL EXCEPTION / AndroidRuntime）、ANR。
/// 未来可扩展 Native crash（signal 11 等）与 watchdog。
/// </summary>
public static class LogSignalScanner
{
    public static bool IsSignal(LogcatLine line)
        => Contains(line.Message, "FATAL EXCEPTION")
        || Contains(line.Message, "AndroidRuntime")
        || Contains(line.Message, "ANR in");

    /// <summary>信号行数（过滤后可见集合内）</summary>
    public static int CountSignals(IEnumerable<LogcatLine> lines)
        => lines.Count(IsSignal);

    private static bool Contains(string text, string marker)
        => text.Contains(marker, StringComparison.OrdinalIgnoreCase);
}
