using System.Text.RegularExpressions;

namespace Yovo.Modules.LogAnalyzer.Application;

/// <summary>
/// logcat -v threadtime 行解析（纯函数，可单测）。
/// 格式: "08-11 10:23:45.678  1234  5678 I TagName: message"
/// 解析失败返回 null（连续输出中的杂散行），调用方跳过。
/// </summary>
public static partial class LogcatParser
{
    public static LogcatLine? Parse(string raw)
    {
        if (ThreadtimeRegex().Match(raw) is not { Success: true } match)
            return null;

        var timestampText = match.Groups["timestamp"].Value;
        var pid = match.Groups["pid"].Value;
        var tid = match.Groups["tid"].Value;
        var level = match.Groups["level"].Value;
        var tag = match.Groups["tag"].Value;
        var message = match.Groups["message"].Value;

        return new LogcatLine(
            Timestamp: ParseTimestamp(timestampText),
            Pid: pid,
            Tid: tid,
            Level: level,
            Tag: tag,
            Message: message,
            Raw: raw);
    }

    /// <summary>"MM-dd HH:mm:ss.fff" → DateTimeOffset（当年；解析失败 null）</summary>
    private static DateTimeOffset? ParseTimestamp(string value)
    {
        var parts = value.Split(' ');
        if (parts.Length != 2)
            return null;
        var dateParts = parts[0].Split('-');
        var timeParts = parts[1].Split(':');
        if (dateParts.Length != 2 || timeParts.Length != 3)
            return null;
        if (!int.TryParse(dateParts[0], out var month) ||
            !int.TryParse(dateParts[1], out var day) ||
            !int.TryParse(timeParts[0], out var hour) ||
            !int.TryParse(timeParts[1], out var minute))
            return null;

        var secondMillis = timeParts[2].Split('.');
        if (secondMillis.Length != 2 || !int.TryParse(secondMillis[0], out var second) ||
            !int.TryParse(secondMillis[1], out var millis))
            return null;

        try
        {
            return new DateTimeOffset(
                    new DateTime(DateTime.Now.Year, month, day, hour, minute, second))
                .AddMilliseconds(millis);
        }
        catch
        {
            return null; // 非法日期（如 13 月）
        }
    }

    [GeneratedRegex(@"^(?<timestamp>\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s+(?<pid>\d+)\s+(?<tid>\d+)\s+(?<level>[VDIWEF])\s+(?<tag>[^:]+):\s?(?<message>.*)$",
        RegexOptions.Compiled)]
    private static partial Regex ThreadtimeRegex();
}
