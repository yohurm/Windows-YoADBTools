using System.IO;

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
/// 平台级日志服务 — 事件驱动 + 文件持久化。
/// 任何层写入，UI 订阅展示；同时落盘到 %LOCALAPPDATA%\YovoAdbTools\Logs\ 便于事后排查。
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

    /// <summary>日志文件路径（排查问题用）</summary>
    string LogFilePath { get; }
}

public class LogService : ILogService
{
    private readonly object _lock = new();
    private readonly List<LogEntry> _entries = [];
    private readonly string _logFile;

    public event Action<LogEntry>? LogAdded;
    public event Action? LogCleared;

    public string LogFilePath => _logFile;

    public LogService()
    {
        var logDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "YovoAdbTools", "Logs");
        Directory.CreateDirectory(logDir);
        _logFile = Path.Combine(logDir, $"app-{DateTime.Now:yyyyMMdd-HHmmss}.log");
    }

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
        Action<LogEntry>? handler;
        lock (_lock)
        {
            _entries.Add(entry);
            // 日志上限，防止无限增长（10 万条后裁剪一半）
            if (_entries.Count > 100_000)
                _entries.RemoveRange(0, 50_000);

            // 落盘（锁外追加，避免事件订阅者卡住写入）
            try
            {
                File.AppendAllText(_logFile,
                    $"[{entry.Timestamp:HH:mm:ss.fff}] [{entry.Level}] {entry.Message}\n");
            }
            catch
            {
                // 磁盘满/权限异常时忽略，不影响主流程
            }

            handler = LogAdded;
        }
        // 锁外触发事件，防止订阅者阻塞其他日志写入
        handler?.Invoke(entry);
    }
}