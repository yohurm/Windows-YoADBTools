using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Messaging;
using Yovo.Platform.Devices;
using Yovo.Platform.Messaging;
using Xunit;

namespace Yovo.Platform.Tests;

/// <summary>设备会话中枢：选择归一化 / 保活 / 焦点</summary>
public class DeviceSessionHubTests
{
    private static readonly AdbDevice DeviceA = new(new DeviceSerial("A"), "device", "ModelA");
    private static readonly AdbDevice DeviceB = new(new DeviceSerial("B"), "device", null);

    [Fact]
    public void SetSelection_single_mode_keeps_only_first()
    {
        var (hub, _) = CreateHub([DeviceA, DeviceB]);
        hub.SetModuleMode("single", DeviceSelectionMode.SingleRequired);

        hub.SetSelection("single", new DeviceSelection(DeviceSelectionMode.SingleRequired, [DeviceA.Serial, DeviceB.Serial]));

        var selection = hub.GetSelection("single");
        Assert.Equal([DeviceA.Serial], selection.Serials);
    }

    [Fact]
    public void SetSelection_multi_mode_keeps_all_distinct()
    {
        var (hub, _) = CreateHub([DeviceA, DeviceB]);
        hub.SetModuleMode("multi", DeviceSelectionMode.MultiOptional);

        hub.SetSelection("multi", new DeviceSelection(DeviceSelectionMode.MultiOptional, [DeviceA.Serial, DeviceB.Serial, DeviceA.Serial]));

        Assert.Equal(2, hub.GetSelection("multi").Serials.Count);
    }

    [Fact]
    public void DevicesRefreshed_prunes_offline_selection_and_active()
    {
        var (hub, bus) = CreateHub([DeviceA, DeviceB]);
        hub.SetModuleMode("multi", DeviceSelectionMode.MultiOptional);
        hub.SetSelection("multi", new DeviceSelection(DeviceSelectionMode.MultiOptional, [DeviceA.Serial, DeviceB.Serial]));
        hub.SetActiveDevice(DeviceA.Serial);
        Assert.NotNull(hub.ActiveDevice);

        // B 掉线，A 保留
        bus.Publish(new DevicesRefreshed([DeviceA]));

        Assert.Equal([DeviceA.Serial], hub.GetSelection("multi").Serials);
    }

    [Fact]
    public void ActiveDevice_cleared_when_offline()
    {
        var (hub, bus) = CreateHub([DeviceA]);
        hub.SetActiveDevice(DeviceA.Serial);
        Assert.NotNull(hub.ActiveDevice);

        bus.Publish(new DevicesRefreshed([]));

        Assert.Null(hub.ActiveDevice);
    }

    [Fact]
    public void SetActiveDevice_ignores_unknown_serial()
    {
        var (hub, _) = CreateHub([DeviceA]);

        hub.SetActiveDevice(new DeviceSerial("NOT-EXIST"));

        Assert.Null(hub.ActiveDevice);
    }

    [Fact]
    public void ActiveDeviceLost_raises_action_and_bus_event()
    {
        // P1-2：掉线导致焦点清空时，Action 与总线成对触发（订阅任一侧均可靠）
        var (hub, bus) = CreateHub([DeviceA]);
        hub.SetActiveDevice(DeviceA.Serial);
        var actionFired = 0;
        var busEvents = 0;
        hub.ActiveDeviceChanged += () => actionFired++;
        using var sub = bus.Subscribe<ActiveDeviceChanged>(_ => busEvents++);

        bus.Publish(new DevicesRefreshed([]));

        Assert.Equal(1, actionFired);
        Assert.Equal(1, busEvents);
    }

    [Fact]
    public void DevicesRefreshed_without_focus_loss_does_not_broadcast()
    {
        // M2 回归：焦点未变化时刷新不产生多余事件
        var (hub, bus) = CreateHub([DeviceA]);
        hub.SetActiveDevice(DeviceA.Serial);
        var actionFired = 0;
        hub.ActiveDeviceChanged += () => actionFired++;

        bus.Publish(new DevicesRefreshed([DeviceA])); // A 仍在

        Assert.Equal(0, actionFired);
    }

    [Fact]
    public void SelectionChanged_emits_module_id()
    {
        var (hub, _) = CreateHub([DeviceA, DeviceB]);
        hub.SetModuleMode("m", DeviceSelectionMode.MultiOptional);
        var received = new List<string>();
        hub.SelectionChanged += id => received.Add(id);

        hub.SetSelection("m", new DeviceSelection(DeviceSelectionMode.MultiOptional, [DeviceA.Serial]));

        Assert.Equal(["m"], received);
    }

    private static (DeviceSessionHub Hub, IEventBus Bus) CreateHub(IReadOnlyList<AdbDevice> devices)
    {
        var bus = new EventBus();
        var directory = new FakeDirectory(devices);
        var hub = new DeviceSessionHub(directory, bus);
        return (hub, bus);
    }

    private sealed class FakeDirectory(IReadOnlyList<AdbDevice> devices) : Abstractions.Devices.IDeviceDirectory
    {
        public IReadOnlyList<AdbDevice> Devices { get; } = devices;
        public event Action? DevicesChanged;
        public Task RefreshAsync(CancellationToken ct = default) => Task.CompletedTask;
    }
}
