using System.Collections.ObjectModel;
using FactoryHelper.Models;

namespace FactoryHelper.Services;

/// <summary>
/// 平台级设备面板服务 — 设备列表与选择状态为所有模块共享。
/// 设备列表 UI 在 Shell 左侧栏（公共区域），各模块通过本服务读取选择状态。
/// </summary>
public interface IDevicePanelService
{
    /// <summary>当前连接的设备列表（只读，由服务刷新）</summary>
    ObservableCollection<AdbDevice> Devices { get; }

    /// <summary>用户选中的设备（Shell 左侧面板多选同步）</summary>
    ObservableCollection<AdbDevice> SelectedDevices { get; }

    /// <summary>是否有选中的设备</summary>
    bool HasSelectedDevices { get; }

    /// <summary>设备选择变化事件</summary>
    event Action? SelectionChanged;

    /// <summary>刷新设备列表（后台执行）</summary>
    Task RefreshAsync();

    /// <summary>同步用户选择（Shell UI 调用）</summary>
    void SyncSelection(IEnumerable<AdbDevice> selected);
}

public class DevicePanelService : IDevicePanelService
{
    private readonly IAdbService _adb;

    public ObservableCollection<AdbDevice> Devices { get; } = [];
    public ObservableCollection<AdbDevice> SelectedDevices { get; } = [];

    public bool HasSelectedDevices => SelectedDevices.Count > 0;

    public event Action? SelectionChanged;

    public DevicePanelService(IAdbService adb)
    {
        _adb = adb;
        SelectedDevices.CollectionChanged += (_, _) => SelectionChanged?.Invoke();
    }

    public void SyncSelection(IEnumerable<AdbDevice> selected)
    {
        SelectedDevices.Clear();
        foreach (var device in selected)
            SelectedDevices.Add(device);
    }

    public async Task RefreshAsync()
    {
        var devices = await _adb.GetDevicesAsync();
        Devices.Clear();
        SelectedDevices.Clear();

        await Task.WhenAll(devices.Select(d => _adb.GetDeviceDetailAsync(d)));

        foreach (var device in devices)
            Devices.Add(device);
    }
}