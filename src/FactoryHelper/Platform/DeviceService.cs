using System.Collections.ObjectModel;

namespace FactoryHelper.Platform;

/// <summary>ADB 设备信息（不可变快照 — 变化即替换 + 事件，天然线程安全）</summary>
public sealed record AdbDevice(string Serial, string State, string? Model)
{
    /// <summary>是否在线可用</summary>
    public bool IsOnline => State == "device";

    /// <summary>界面显示名称</summary>
    public string DisplayName => string.IsNullOrEmpty(Model) ? Serial : $"{Model} ({Serial})";
}

/// <summary>
/// 设备服务 — 平台级设备快照与选择会话。
/// 只暴露不可变快照 + 事件（不暴露 UI 集合类型），UI 集合归 Shell 层。
/// 事件在后台线程触发，订阅者负责 UI 编组。
/// </summary>
public interface IDeviceService
{
    /// <summary>当前设备列表（不可变快照）</summary>
    IReadOnlyList<AdbDevice> Devices { get; }

    /// <summary>当前选中设备（不可变快照）</summary>
    IReadOnlyList<AdbDevice> SelectedDevices { get; }

    /// <summary>是否有选中设备</summary>
    bool HasSelectedDevices { get; }

    /// <summary>设备列表变化（扫描完成/差异合并后）</summary>
    event Action? DevicesChanged;

    /// <summary>选择变化</summary>
    event Action? SelectionChanged;

    /// <summary>刷新设备列表（防重入；按 Serial 差异合并，选中保留）</summary>
    Task RefreshAsync(CancellationToken ct = default);

    /// <summary>同步用户选择（Shell UI 调用）</summary>
    void SetSelection(IReadOnlyCollection<AdbDevice> selected);
}

public class DeviceService : IDeviceService
{
    private readonly IAdbProcessService _adb;
    private readonly SemaphoreSlim _refreshLock = new(1, 1);
    private readonly object _lock = new();

    private List<AdbDevice> _devices = [];
    private List<AdbDevice> _selected = [];

    public IReadOnlyList<AdbDevice> Devices { get { lock (_lock) return _devices; } }
    public IReadOnlyList<AdbDevice> SelectedDevices { get { lock (_lock) return _selected; } }
    public bool HasSelectedDevices { get { lock (_lock) return _selected.Count > 0; } }

    public event Action? DevicesChanged;
    public event Action? SelectionChanged;

    public DeviceService(IAdbProcessService adb)
    {
        _adb = adb;
    }

    public void SetSelection(IReadOnlyCollection<AdbDevice> selected)
    {
        lock (_lock)
        {
            _selected = selected.ToList();
        }
        SelectionChanged?.Invoke();
    }

    public async Task RefreshAsync(CancellationToken ct = default)
    {
        // 防重入：连续刷新只执行一次，避免并发 adb 进程
        if (!await _refreshLock.WaitAsync(0, ct))
            return;

        try
        {
            var raw = await _adb.RunAsync("", "devices -l", timeoutMs: 8000, ct: ct);

            List<AdbDevice> devices;
            if (raw.ExitCode == 0)
                devices = ParseDevices(raw.Output);
            else
                devices = [];

            // 选中保留：按 Serial 匹配仍在线设备
            List<string> selectedSerials;
            lock (_lock)
            {
                selectedSerials = _selected.Where(d => d.IsOnline).Select(d => d.Serial).ToList();
                _devices = devices;
                _selected = devices.Where(d => selectedSerials.Contains(d.Serial)).ToList();
            }

            DevicesChanged?.Invoke();
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    /// <summary>
    /// 解析 `adb devices -l` 输出（一次进程调用拿到 序列号+状态+型号）：
    /// 行格式: "serial  state product:xxx model:yyy device:zzz transport_id:n"
    /// </summary>
    private static List<AdbDevice> ParseDevices(string output)
    {
        var result = new List<AdbDevice>();
        foreach (var line in output.Split('\n', StringSplitOptions.RemoveEmptyEntries).Skip(1)) // 跳过表头
        {
            var parts = line.Trim().Split([' ', '\t'], StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 2)
                continue;

            var serial = parts[0];
            var state = parts[1];
            var model = parts.FirstOrDefault(p => p.StartsWith("model:", StringComparison.OrdinalIgnoreCase))
                            ?.Substring("model:".Length);

            result.Add(new AdbDevice(serial, state, string.IsNullOrEmpty(model) ? null : model));
        }
        return result;
    }
}
