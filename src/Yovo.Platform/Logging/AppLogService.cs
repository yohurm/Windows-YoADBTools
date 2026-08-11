using Yovo.Platform.Abstractions.Logging;

namespace Yovo.Platform.Logging;

/// <summary>
/// 应用日志实现 — 内存环形缓冲（上限裁剪）+ 订阅 + 迟到快照。默认不落盘（产线需求）。
/// 事件在写入线程回调（锁外），UI 侧由 VM 用 IUiDispatcher 编组。
/// </summary>
public class AppLogService : IAppLog
{
    private const int MaxEntries = 100_000;

    private readonly object _lock = new();
    private readonly List<AppLogEntry> _entries = [];
    private readonly List<(AppLogFilter Filter, Action<AppLogEntry> Handler)> _subscribers = [];

    public void Write(AppLogLevel level, string message, string source = "",
        IReadOnlyDictionary<string, string>? tags = null)
    {
        var entry = new AppLogEntry(DateTimeOffset.Now, level, message, source,
            tags ?? new Dictionary<string, string>());

        (AppLogFilter Filter, Action<AppLogEntry> Handler)[] subscribers;
        lock (_lock)
        {
            _entries.Add(entry);
            if (_entries.Count > MaxEntries)
                _entries.RemoveRange(0, _entries.Count - MaxEntries);
            subscribers = _subscribers.ToArray();
        }

        // 锁外回调：订阅者不阻塞日志写入
        foreach (var (filter, handler) in subscribers)
        {
            if (Matches(filter, entry))
            {
                try
                {
                    handler(entry);
                }
                catch
                {
                    // 订阅者异常隔离
                }
            }
        }
    }

    public void Info(string message, string source = "", IReadOnlyDictionary<string, string>? tags = null)
        => Write(AppLogLevel.Info, message, source, tags);

    public void Warn(string message, string source = "", IReadOnlyDictionary<string, string>? tags = null)
        => Write(AppLogLevel.Warn, message, source, tags);

    public void Error(string message, string source = "", IReadOnlyDictionary<string, string>? tags = null)
        => Write(AppLogLevel.Error, message, source, tags);

    public IDisposable Subscribe(AppLogFilter? filter, Action<AppLogEntry> handler)
    {
        var subscription = (filter ?? new AppLogFilter(), handler);
        lock (_lock)
            _subscribers.Add(subscription);
        return new Unsubscriber(() =>
        {
            lock (_lock)
                _subscribers.Remove(subscription);
        });
    }

    public IReadOnlyList<AppLogEntry> Snapshot(AppLogFilter? filter = null, int max = 2000)
    {
        lock (_lock)
        {
            var source = _entries;
            if (source.Count > max)
                source = source.GetRange(source.Count - max, max);
            return source.Where(e => Matches(filter ?? new AppLogFilter(), e)).ToList();
        }
    }

    private static bool Matches(AppLogFilter filter, AppLogEntry entry)
    {
        if (filter.Source is { } source && !string.Equals(source, entry.Source, StringComparison.Ordinal))
            return false;
        if (filter.MinLevel is { } min && entry.Level < min)
            return false;
        return true;
    }

    private sealed class Unsubscriber(Action action) : IDisposable
    {
        private Action? _action = action;
        public void Dispose() => Interlocked.Exchange(ref _action, null)?.Invoke();
    }
}
