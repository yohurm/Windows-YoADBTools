using Yovo.Platform.Abstractions.Adb;
using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Messaging;

namespace Yovo.Platform.Devices;

/// <summary>
/// 设备目录实现 — 只维护"事实"（已连接设备），不含用户选择。
/// 一次 `devices -l` 进程调用解析 序列号+状态+型号；防重入；扫描差异通过总线广播。
/// 会话保活由 IDeviceSessionHub 订阅 DevicesRefreshed 完成（职责分离）。
/// </summary>
public class DeviceDirectory : IDeviceDirectory
{
    private static readonly TimeSpan ScanTimeout = TimeSpan.FromSeconds(8);

    private readonly IAdbCommandExecutor _adb;
    private readonly IEventBus _bus;
    private readonly SemaphoreSlim _refreshLock = new(1, 1);
    private readonly object _lock = new();
    private List<AdbDevice> _devices = [];

    public DeviceDirectory(IAdbCommandExecutor adb, IEventBus bus)
    {
        _adb = adb;
        _bus = bus;
    }

    public IReadOnlyList<AdbDevice> Devices
    {
        get
        {
            lock (_lock)
                return _devices;
        }
    }

    public event Action? DevicesChanged;

    public async Task RefreshAsync(CancellationToken ct = default)
    {
        // 防重入：连续刷新只执行一次，避免并发 adb 进程
        if (!await _refreshLock.WaitAsync(0, ct))
            return;

        try
        {
            var raw = await _adb.ExecuteAsync(null, "devices -l", ScanTimeout, ct);
            var fresh = raw.ExitCode == 0 ? ParseDevices(raw.Output) : [];

            List<AdbDevice> gone;
            lock (_lock)
            {
                gone = _devices.Where(d => d.IsOnline && fresh.All(f => f.Serial != d.Serial)).ToList();
                _devices = fresh;
            }

            DevicesChanged?.Invoke();
            _bus.Publish(new DevicesRefreshed(fresh));

            // 在线设备消失 → 逐个广播离线（logcat 等模块自行停止）
            foreach (var offline in gone)
                _bus.Publish(new DeviceOffline(offline.Serial));
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
    internal static List<AdbDevice> ParseDevices(string output)
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

            result.Add(new AdbDevice(new DeviceSerial(serial), state, string.IsNullOrEmpty(model) ? null : model));
        }
        return result;
    }
}
