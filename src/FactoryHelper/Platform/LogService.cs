namespace FactoryHelper.Platform;

/// <summary>日志级别</summary>
public enum LogLevel { Info, Warn, Error }

/// <summary>一条日志（不可变）</summary>
public sealed record LogEntry(DateTime Timestamp, LogLevel Level, string Message, string Source);

/// <summary>
/// 平台日志服务 — 内存队列 + 事件广播（不落盘）。
/// 订阅者按 Source 过滤；事件在调用线程触发（通常后台），UI 侧由 VM 用 SynchronizationContext 编组。
/// 内存上限裁剪，防止无限增长。
/// </summary>
public interface ILogService
{
    /// <summary>新日志事件</summary>
    event Action<LogEntry>? LogAdded;

    void Info(string message, string source = "");
    void Warn(string message, string source = "");
    void Error(string message, string source = "");
}

public class LogService : ILogService
{
    private const int MaxEntries = 100_000;

    private readonly object _lock = new();
    private readonly List<LogEntry> _entries = [];

    public event Action<LogEntry>? LogAdded;

    public void Info(string message, string source = "")
        => Add(new LogEntry(DateTime.Now, LogLevel.Info, message, source));

    public void Warn(string message, string source = "")
        => Add(new LogEntry(DateTime.Now, LogLevel.Warn, message, source));

    public void Error(string message, string source = "")
        => Add(new LogEntry(DateTime.Now, LogLevel.Error, message, source));

    private void Add(LogEntry entry)
    {
        Action<LogEntry>? handler;
        lock (_lock)
        {
            _entries.Add(entry);
            // 上限裁剪，防无限增长
            if (_entries.Count > MaxEntries)
                _entries.RemoveRange(0, _entries.Count - MaxEntries);
            handler = LogAdded;
        }
        // 锁外触发事件，防止订阅者阻塞日志写入
        handler?.Invoke(entry);
    }
}
