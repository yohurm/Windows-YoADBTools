namespace FactoryHelper.Services;

/// <summary>日志级别</summary>
public enum LogLevel
{
    Info,
    Warn,
    Error
}

/// <summary>一条日志</summary>
public class LogEntry
{
    public DateTime Timestamp { get; init; } = DateTime.Now;
    public LogLevel Level { get; init; } = LogLevel.Info;
    public string Message { get; init; } = string.Empty;
    public string Source { get; init; } = string.Empty; // 模块标识，如 "adb-terminal"
}

/// <summary>
/// 平台级日志服务 — 事件驱动，任何层写入，UI 订阅展示。
/// 线程安全：事件在任意线程触发，订阅方负责切回 UI 线程。
/// </summary>
public interface ILogService
{
    /// <summary>新日志事件</summary>
    event Action<LogEntry>? LogAdded;

    /// <summary>日志被清空事件</summary>
    event Action? LogCleared;

    /// <summary>写入普通日志</summary>
    void Info(string message, string source = "");

    /// <summary>写入警告日志</summary>
    void Warn(string message, string source = "");

    /// <summary>写入错误日志</summary>
    void Error(string message, string source = "");

    /// <summary>清空全部日志</summary>
    void Clear();
}

public class LogService : ILogService
{
    private readonly object _lock = new();
    private readonly List<LogEntry> _entries = [];

    public event Action<LogEntry>? LogAdded;
    public event Action? LogCleared;

    public void Info(string message, string source = "")
        => Add(new LogEntry { Level = LogLevel.Info, Message = message, Source = source });

    public void Warn(string message, string source = "")
        => Add(new LogEntry { Level = LogLevel.Warn, Message = message, Source = source });

    public void Error(string message, string source = "")
        => Add(new LogEntry { Level = LogLevel.Error, Message = message, Source = source });

    public void Clear()
    {
        lock (_lock)
        {
            _entries.Clear();
        }
        LogCleared?.Invoke();
    }

    private void Add(LogEntry entry)
    {
        lock (_lock)
        {
            _entries.Add(entry);
            // 日志上限，防止无限增长（10 万条后裁剪一半）
            if (_entries.Count > 100_000)
                _entries.RemoveRange(0, 50_000);
        }
        LogAdded?.Invoke(entry);
    }
}