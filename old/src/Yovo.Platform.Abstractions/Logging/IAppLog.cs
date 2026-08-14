namespace Yovo.Platform.Abstractions.Logging;

/// <summary>应用操作日志级别</summary>
public enum AppLogLevel
{
    Info,
    Warn,
    Error,
}

/// <summary>一条应用日志（不可变；Tags 用于 serial 等附加维度）</summary>
public sealed record AppLogEntry(
    DateTimeOffset Timestamp,
    AppLogLevel Level,
    string Message,
    string Source,
    IReadOnlyDictionary<string, string> Tags);

/// <summary>订阅/快照过滤条件</summary>
public sealed record AppLogFilter(string? Source = null, AppLogLevel? MinLevel = null);

/// <summary>
/// 应用/模块操作日志 — 仅表示操作事件，绝不承载设备 logcat（ADR-006）。
/// 内存环形缓冲 + 迟到订阅可 Snapshot；默认不落盘（产线需求），设置可开调试落盘。
/// 事件在写入线程回调；UI 侧用 IUiDispatcher 编组。
/// </summary>
public interface IAppLog
{
    void Write(AppLogLevel level, string message, string source = "",
        IReadOnlyDictionary<string, string>? tags = null);

    void Info(string message, string source = "", IReadOnlyDictionary<string, string>? tags = null);
    void Warn(string message, string source = "", IReadOnlyDictionary<string, string>? tags = null);
    void Error(string message, string source = "", IReadOnlyDictionary<string, string>? tags = null);

    /// <summary>订阅新日志（filter 为空表示全部）；返回 IDisposable 退订</summary>
    IDisposable Subscribe(AppLogFilter? filter, Action<AppLogEntry> handler);

    /// <summary>迟到快照（环形缓冲现有内容）</summary>
    IReadOnlyList<AppLogEntry> Snapshot(AppLogFilter? filter = null, int max = 2000);
}
