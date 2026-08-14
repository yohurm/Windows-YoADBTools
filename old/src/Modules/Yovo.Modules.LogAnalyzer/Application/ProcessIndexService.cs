using System.Text.RegularExpressions;
using Yovo.Platform.Abstractions.Adb;
using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Logging;

namespace Yovo.Modules.LogAnalyzer.Application;

/// <summary>进程条目（ps 解析结果；ProcessName ≈ 包名，Android 上应用进程名即包名）</summary>
public sealed record ProcessEntry(string Pid, string ProcessName, DateTimeOffset LastSeenUtc);

/// <summary>
/// ps 输出解析（纯函数）— 兼容两版输出：
///   ps -A -o PID,NAME        → "  123  com.example.app"
///   ps -A（完整格式）         → "root      123  1  ...  com.example.app"
/// 表头行（PID NAME / USER）自然跳过（pid 组非数字）。返回全量进程条目（含多进程包）。
/// </summary>
public static partial class ProcessPsParser
{
    // 产线设备常驻进程可达数百，高 PID 应用（如 com.ggec.hs01 pid 30407）必须保留 —
    // 500 上限会截断导致按包名下拉找不到目标应用（2026-08-12 真实设备复现）
    private const int MaxEntries = 2000;

    // 两列格式：PID NAME
    [GeneratedRegex(@"^\s*(?<pid>\d+)\s+(?<name>\S+)\s*$", RegexOptions.Compiled)]
    private static partial Regex TwoColumnRegex();

    // 完整格式：USER PID PPID VSZ RSS WCHAN ADDR S NAME（名称允许 : 后缀如 com.foo:push）
    [GeneratedRegex(@"^\s*\S+\s+(?<pid>\d+)\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(?<name>\S+)\s*$", RegexOptions.Compiled)]
    private static partial Regex FullFormatRegex();

    /// <summary>解析 ps 输出（按行尝试两种格式；超上限截断防异常列表）</summary>
    public static IReadOnlyList<ProcessEntry> Parse(string output, DateTimeOffset now)
    {
        var list = new List<ProcessEntry>();
        foreach (var line in output.Split('\n'))
        {
            if (list.Count >= MaxEntries)
                break;
            var trimmed = line.Trim();
            if (trimmed.Length == 0)
                continue;

            var match = TwoColumnRegex().Match(trimmed);
            if (!match.Success)
                match = FullFormatRegex().Match(trimmed);
            if (!match.Success)
                continue; // 表头/杂散行

            list.Add(new ProcessEntry(match.Groups["pid"].Value, match.Groups["name"].Value, now));
        }
        return list;
    }
}

/// <summary>
/// 进程索引（M1 F41/F43）— 周期性 adb shell ps 建立 包名↔PID 映射（方案 B 为主）。
/// threadtime 行不含包名，必须侧信道映射（设计文档 §4.3）。采集中每 2.5s 刷新；
/// 失败降级「仅 PID 模式」（IsAvailable=false，保留旧快照，状态栏提示）。
/// Snapshot virtual 供测试替身（与 DeviceCaptureService.BufferSnapshot 同模式）。
/// </summary>
public class ProcessIndexService(IAdbCommandExecutor adb, IAppLog log)
{
    /// <summary>刷新周期（设计文档：采集中每 2–3s）</summary>
    public const int RefreshIntervalMs = 2500;

    private readonly object _lock = new();
    private List<ProcessEntry> _snapshot = [];
    private CancellationTokenSource? _cts;

    /// <summary>最近一次成功刷新的进程快照（线程安全拷贝）</summary>
    public virtual IReadOnlyList<ProcessEntry> Snapshot
    {
        get
        {
            lock (_lock)
                return _snapshot.ToList();
        }
    }

    /// <summary>最近成功刷新时间（状态栏「进程索引年龄」）</summary>
    public DateTimeOffset? LastUpdatedUtc { get; private set; }

    /// <summary>索引是否可用（ps 失败 → 降级仅 PID 模式）</summary>
    public bool IsAvailable { get; private set; }

    /// <summary>快照刷新（包名下拉 / 会话重绑订阅）</summary>
    public event Action? Changed;

    /// <summary>触发变更通知（子类/测试替身模拟刷新完成的缝）</summary>
    protected void NotifyChanged() => Changed?.Invoke();

    /// <summary>开始周期刷新（已在刷新则忽略）</summary>
    public void Start(DeviceSerial serial)
    {
        lock (_lock)
        {
            if (_cts is not null)
                return;
            _cts = new CancellationTokenSource();
        }
        _ = RefreshLoopAsync(serial, _cts.Token);
    }

    /// <summary>停止刷新（幂等）</summary>
    public void Stop()
    {
        lock (_lock)
        {
            _cts?.Cancel();
            _cts?.Dispose();
            _cts = null;
        }
    }

    /// <summary>包名 → PID 集合（ADR-LA-008：默认精确进程名；includeChildren 时前缀匹配 com.foo:*）</summary>
    public IReadOnlySet<string> PidSetFor(string packageName, bool includeChildren)
    {
        var set = new HashSet<string>();
        foreach (var entry in Snapshot)
        {
            if (entry.ProcessName == packageName ||
                (includeChildren && entry.ProcessName.StartsWith(packageName + ":", StringComparison.Ordinal)))
                set.Add(entry.Pid);
        }
        return set;
    }

    /// <summary>PID → 进程条目（Pid 作用域显示解析到的包名）</summary>
    public ProcessEntry? FindByPid(string pid)
        => Snapshot.FirstOrDefault(e => e.Pid == pid);

    /// <summary>按关键字检索进程（包名下拉可搜索；空 = 全量按名排序）</summary>
    public IReadOnlyList<ProcessEntry> Search(string? keyword)
    {
        var entries = string.IsNullOrWhiteSpace(keyword)
            ? Snapshot
            : Snapshot.Where(e => e.ProcessName.Contains(keyword.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
        return entries
            .OrderBy(e => e.ProcessName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(e => e.Pid, StringComparer.Ordinal)
            .ToList();
    }

    // ==================== 内部 ====================

    private async Task RefreshLoopAsync(DeviceSerial serial, CancellationToken ct)
    {
        try
        {
            while (!ct.IsCancellationRequested)
            {
                await RefreshOnceAsync(serial, ct);
                await Task.Delay(RefreshIntervalMs, ct);
            }
        }
        catch (OperationCanceledException)
        {
            // 正常停止
        }
    }

    private async Task RefreshOnceAsync(DeviceSerial serial, CancellationToken ct)
    {
        try
        {
            var raw = await adb.ExecuteAsync(serial, "shell ps -A -o PID,NAME",
                TimeSpan.FromSeconds(10), ct);
            if (raw.ExitCode != 0)
            {
                Degrade();
                return;
            }
            var parsed = ProcessPsParser.Parse(raw.Output, DateTimeOffset.Now);
            if (parsed.Count == 0)
            {
                Degrade(); // 空输出 = ps 不可用（降级仅 PID 模式）
                return;
            }
            lock (_lock)
            {
                _snapshot = parsed.ToList();
                IsAvailable = true;
                LastUpdatedUtc = DateTimeOffset.Now;
            }
            Changed?.Invoke();
        }
        catch (OperationCanceledException)
        {
            throw; // 停止路径：直接退出循环
        }
        catch (Exception ex)
        {
            log.Error($"进程索引刷新失败: {ex.Message}", LogAnalyzerModule.ModuleId);
            Degrade();
        }
    }

    /// <summary>降级：仅 PID 模式（保留旧快照，标注不可用）</summary>
    private void Degrade()
    {
        var changed = false;
        lock (_lock)
        {
            changed = IsAvailable;
            IsAvailable = false;
        }
        if (changed)
            Changed?.Invoke();
    }
}
