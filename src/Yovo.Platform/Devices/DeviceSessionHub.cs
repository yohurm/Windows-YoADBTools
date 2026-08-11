using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Messaging;

namespace Yovo.Platform.Devices;

/// <summary>
/// 设备会话中枢实现 — 全局焦点 + 每模块选择作用域。
/// 订阅 DevicesRefreshed 做保活：scope 按 serial 过滤仍在线设备；Active 掉线清空。
/// 事件在发布线程触发；UI 侧用 IUiDispatcher 编组。
/// </summary>
public class DeviceSessionHub : IDeviceSessionHub
{
    private readonly IDeviceDirectory _directory;
    private readonly IEventBus _bus;
    private readonly object _lock = new();

    private AdbDevice? _active;
    private readonly Dictionary<string, DeviceSelection> _selections = [];
    private readonly Dictionary<string, DeviceSelectionMode> _modes = [];

    public DeviceSessionHub(IDeviceDirectory directory, IEventBus bus)
    {
        _directory = directory;
        _bus = bus;
        // 设备目录刷新后保活（订阅一次，生命周期与应用同长）
        _bus.Subscribe<DevicesRefreshed>(OnDevicesRefreshed);
    }

    public AdbDevice? ActiveDevice
    {
        get
        {
            lock (_lock)
                return _active;
        }
    }

    public event Action? ActiveDeviceChanged;
    public event Action<string>? SelectionChanged;

    public void SetModuleMode(string moduleId, DeviceSelectionMode mode)
    {
        lock (_lock)
            _modes[moduleId] = mode;
    }

    public DeviceSelection GetSelection(string moduleId)
    {
        lock (_lock)
            return _selections.GetValueOrDefault(moduleId) ?? DeviceSelection.Empty(GetMode(moduleId));
    }

    public void SetSelection(string moduleId, DeviceSelection selection)
    {
        lock (_lock)
        {
            var mode = GetMode(moduleId);
            // 按声明模式归一化：Single* 只保留第一个（并同步 ActiveDevice）；None 不接受
            if (mode == DeviceSelectionMode.None)
                return;
            if (IsSingle(mode))
            {
                var first = selection.Serials.FirstOrDefault();
                _selections[moduleId] = new DeviceSelection(mode,
                    first.IsEmpty ? [] : [first]);
            }
            else
            {
                _selections[moduleId] = new DeviceSelection(mode, selection.Serials.Distinct().ToList());
            }
        }
        SelectionChanged?.Invoke(moduleId);
    }

    public void SetActiveDevice(DeviceSerial? serial)
    {
        lock (_lock)
        {
            var device = serial is { IsEmpty: false } s
                ? _directory.Devices.FirstOrDefault(d => d.Serial == s)
                : null;
            if (_active?.Serial == device?.Serial)
                return; // 无变化不广播
            _active = device;
        }
        ActiveDeviceChanged?.Invoke();
        if (_active is not null)
            _bus.Publish(new ActiveDeviceChanged(_active.Serial));
    }

    // ==================== 内部 ====================

    private DeviceSelectionMode GetMode(string moduleId)
        => _modes.GetValueOrDefault(moduleId, DeviceSelectionMode.None);

    private static bool IsSingle(DeviceSelectionMode mode)
        => mode is DeviceSelectionMode.SingleRequired or DeviceSelectionMode.SingleOptional;

    private void OnDevicesRefreshed(DevicesRefreshed message)
    {
        lock (_lock)
        {
            var alive = message.Devices.Select(d => d.Serial).ToHashSet();

            // scope 保活：过滤掉已离线设备
            foreach (var (moduleId, selection) in _selections.ToList())
            {
                var kept = selection.Serials.Where(s => alive.Contains(s)).ToList();
                if (kept.Count != selection.Serials.Count)
                    _selections[moduleId] = selection with { Serials = kept };
            }

            // Active 掉线清空
            if (_active is { } active && !alive.Contains(active.Serial))
                _active = null;
        }

        // 锁外广播（避免订阅者回调死锁）
        SelectionChanged?.Invoke(string.Empty);
        if (_active is null)
            _bus.Publish(new ActiveDeviceChanged(null));
    }
}
