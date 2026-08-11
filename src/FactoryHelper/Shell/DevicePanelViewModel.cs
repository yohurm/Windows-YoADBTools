using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using CommunityToolkit.Mvvm.Input;
using FactoryHelper.Platform;

namespace FactoryHelper.Shell;

/// <summary>
/// 设备面板 ViewModel — 设备集合绑定 + 刷新 + 选中同步 + 状态文本。
/// 数据源是 IDeviceService 快照；UI 集合只存在于本 VM（服务层不暴露 UI 类型）。
/// </summary>
public partial class DevicePanelViewModel : INotifyPropertyChanged
{
    private readonly IDeviceService _devices;
    private readonly ILogService _log;
    private readonly SynchronizationContext _sync; // 构造于 UI 线程，捕获用于事件编组

    /// <summary>设备列表（UI 绑定；行为/刷新双向维护）</summary>
    public ObservableCollection<AdbDevice> Devices { get; } = [];

    /// <summary>选中设备（SelectedItemsBehavior 写入；变化同步到服务）</summary>
    public ObservableCollection<AdbDevice> SelectedDevices { get; } = [];

    private bool _isRefreshing;
    public bool IsRefreshing
    {
        get => _isRefreshing;
        set { _isRefreshing = value; OnPropertyChanged(); }
    }

    private string _statusText = "就绪";
    public string StatusText
    {
        get => _statusText;
        set { _statusText = value; OnPropertyChanged(); }
    }

    private bool _isDevicesExpanded = true;
    /// <summary>设备列表展开状态（标题行折叠按钮，产线多设备时释放导航空间）</summary>
    public bool IsDevicesExpanded
    {
        get => _isDevicesExpanded;
        set { _isDevicesExpanded = value; OnPropertyChanged(); }
    }

    public DevicePanelViewModel(IDeviceService devices, ILogService log)
    {
        _devices = devices;
        _log = log;
        _sync = SynchronizationContext.Current ?? new SynchronizationContext();

        // 用户点选 → 同步到服务（服务内部去重快照）
        SelectedDevices.CollectionChanged += (_, _) => _devices.SetSelection(SelectedDevices);

        // 服务事件（后台线程）→ 编组回 UI 线程
        _devices.DevicesChanged += () => _sync.Post(_ => SyncFromService(), null);
        _devices.SelectionChanged += () => _sync.Post(_ => OnSelectionChanged(), null);
    }

    [RelayCommand]
    private async Task RefreshAsync()
    {
        if (IsRefreshing) return;

        IsRefreshing = true;
        StatusText = "正在扫描设备...";
        try
        {
            await _devices.RefreshAsync();
            var count = _devices.Devices.Count;
            StatusText = count > 0 ? $"已连接 {count} 台设备" : "未发现设备";
        }
        catch (Exception ex)
        {
            _log.Error($"设备扫描失败: {ex.Message}", "shell");
            StatusText = "设备扫描失败";
        }
        finally
        {
            IsRefreshing = false;
        }
    }

    /// <summary>服务快照 → UI 集合（差异合并：选中按 Serial 保留，仅同步变化项）</summary>
    private void SyncFromService()
    {
        var serverDevices = _devices.Devices;
        var selectedSerials = SelectedDevices.Select(d => d.Serial).ToHashSet();

        // 列表差异更新（避免全量重建闪烁）
        var newSerials = serverDevices.Select(d => d.Serial).ToHashSet();
        foreach (var gone in Devices.Where(d => !newSerials.Contains(d.Serial)).ToList())
            Devices.Remove(gone);
        foreach (var fresh in serverDevices)
        {
            var existing = Devices.FirstOrDefault(d => d.Serial == fresh.Serial);
            if (existing is null)
                Devices.Add(fresh);
            else if (existing != fresh) // record 值比较：Model 等变化时替换
            {
                var index = Devices.IndexOf(existing);
                Devices[index] = fresh;
            }
        }

        // 选中回填：仍在线且原选中 → 保留（行为不会反向写回，无循环）
        var currentSerials = SelectedDevices.Select(d => d.Serial).ToHashSet();
        if (!currentSerials.SetEquals(selectedSerials))
        {
            SelectedDevices.Clear();
            foreach (var device in Devices.Where(d => selectedSerials.Contains(d.Serial)))
                SelectedDevices.Add(device);
        }
    }

    private void OnSelectionChanged()
        => OnPropertyChanged(nameof(SelectedDevices));

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
