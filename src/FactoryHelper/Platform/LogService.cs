using System.Collections.Concurrent;
using System.IO;
using System.Text;

namespace FactoryHelper.Platform;

/// <summary>日志级别</summary>
public enum LogLevel { Info, Warn, Error }

/// <summary>一条日志（不可变）</summary>
public sealed record LogEntry(DateTime Timestamp, LogLevel Level, string Message, string Source);

/// <summary>
/// 平台日志服务 — 事件广播 + 文件持久化。
/// 写入仅入队（锁内零 IO），后台线程每 500ms 批量落盘；订阅者按 Source 过滤。
/// 事件在后台线程触发，UI 侧由 VM 用 SynchronizationContext 编组。
/// 文件为审计日志，永不删除；单文件超 5MB 滚动新文件。
/// </summary>
public interface ILogService
{
    /// <summary>新日志事件（后台线程触发）</summary>
    event Action<LogEntry>? LogAdded;

    /// <summary>当前日志文件路径（排查问题用）</summary>
    string LogFilePath { get; }

    void Info(string message, string source = "");
    void Warn(string message, string source = "");
    void Error(string message, string source = "");
}

public class LogService : ILogService, IDisposable
{
    private const int MaxQueuedEntries = 100_000;
    private const long RotateBytes = 5 * 1024 * 1024; // 5MB

    private readonly ConcurrentQueue<LogEntry> _queue = new();
    private readonly CancellationTokenSource _cts = new();
    private readonly object _fileLock = new();
    private readonly string _logDir;
    private string _logFile;
    private Task? _flushTask;

    public event Action<LogEntry>? LogAdded;

    public string LogFilePath => _logFile;

    public LogService()
    {
        _logDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "YovoAdbTools", "Logs");
        Directory.CreateDirectory(_logDir);
        _logFile = CreateLogFile();

        // 后台批量落盘：事件调用路径零 IO
        _flushTask = Task.Run(() => FlushLoopAsync(_cts.Token));
    }

    public void Info(string message, string source = "")
        => Add(new LogEntry(DateTime.Now, LogLevel.Info, message, source));

    public void Warn(string message, string source = "")
        => Add(new LogEntry(DateTime.Now, LogLevel.Warn, message, source));

    public void Error(string message, string source = "")
        => Add(new LogEntry(DateTime.Now, LogLevel.Error, message, source));

    public void Dispose()
    {
        _cts.Cancel();
        try { _flushTask?.GetAwaiter().GetResult(); } catch { /* 取消路径忽略 */ }
        _cts.Dispose();
    }

    // ==================== 内部 ====================

    private void Add(LogEntry entry)
    {
        _queue.Enqueue(entry);
        // 队列上限保护：磁盘慢时丢弃最旧，保活主流程
        while (_queue.Count > MaxQueuedEntries && _queue.TryDequeue(out _)) { }
        LogAdded?.Invoke(entry);
    }

    private async Task FlushLoopAsync(CancellationToken ct)
    {
        while (true)
        {
            try { await Task.Delay(500, ct); } catch (OperationCanceledException) { break; }
            FlushPending();
        }
        FlushPending(); // 退出前最终落盘
    }

    private void FlushPending()
    {
        if (_queue.IsEmpty)
            return;

        var sb = new StringBuilder();
        while (_queue.TryDequeue(out var entry))
        {
            sb.Append('[').Append(entry.Timestamp.ToString("HH:mm:ss.fff"))
              .Append("] [").Append(entry.Level).Append("] ").Append(entry.Message).Append('\n');
        }

        lock (_fileLock)
        {
            try
            {
                File.AppendAllText(_logFile, sb.ToString(), Encoding.UTF8);
                RotateIfNeeded();
            }
            catch
            {
                // 磁盘满/权限异常：丢本次落盘，不影响主流程
            }
        }
    }

    private void RotateIfNeeded()
    {
        try
        {
            if (new FileInfo(_logFile).Length > RotateBytes)
                _logFile = CreateLogFile();
        }
        catch
        {
            // 轮转失败忽略，下次再试
        }
    }

    private string CreateLogFile()
        => Path.Combine(_logDir, $"app-{DateTime.Now:yyyyMMdd-HHmmss}.log");
}
