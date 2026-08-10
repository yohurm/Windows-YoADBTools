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

    /// <summary>刷新设备列表（后台执行，绝不阻塞 UI）</summary>
    Task RefreshAsync();

    /// <summary>同步用户选择（Shell UI 调用）</summary>
    void SyncSelection(IEnumerable<AdbDevice> selected);
}

public class DevicePanelService : IDevicePanelService
{
    private readonly IAdbService _adb;
    private readonly SemaphoreSlim _refreshLock = new(1, 1);

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
        // 防重入：连续点击刷新时只执行一次，避免并发 adb 进程
        if (!await _refreshLock.WaitAsync(0))
            return;

        try
        {
            var devices = await _adb.GetDevicesAsync();

            // 并行获取设备详情，但每台设备详情获取内部已有超时保护
            // 离线/异常设备不会阻塞整个刷新
            await Task.WhenAll(devices.Select(d => _adb.GetDeviceDetailAsync(d)));

            Devices.Clear();
            SelectedDevices.Clear();
            foreach (var device in devices)
                Devices.Add(device);
        }
        finally
        {
            _refreshLock.Release();
        }
    }
}