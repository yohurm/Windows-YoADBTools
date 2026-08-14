using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Yovo.Platform.Abstractions;
using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Logging;
using Yovo.Platform.Abstractions.Settings;

namespace Yovo.Shell.ViewModels;

/// <summary>
/// 设备栏 ViewModel — 设备列表 + 选中同步 + 刷新 + 状态文本（Shell 左栏公共区）。
/// 选择语义（v5 §9.3）：单击 = ActiveDevice + 当前模块 scope；多选仅 Multi* 模块。
/// 数据源是 IDeviceDirectory 快照 + IDeviceSessionHub 会话；UI 集合只存在于本 VM。
/// 事件（后台线程）→ IUiDispatcher 编组回 UI 线程。
/// </summary>
public partial class DeviceRailViewModel : ObservableObject
{
    private readonly IDeviceDirectory _directory;
    private readonly IDeviceSessionHub _hub;
    private readonly IAppLog _log;
    private readonly IUiDispatcher _ui;
    private readonly ISettingsStore _settings;

    /// <summary>自动刷新定时器（G-P1-3：devices.autoRefresh 秒，0=关，默认关）</summary>
    private System.Threading.Timer? _autoRefreshTimer;

    /// <summary>当前激活模块的选择模式（导航切换时更新）</summary>
    private string _currentModuleId = string.Empty;
    private DeviceSelectionMode _currentMode = DeviceSelectionMode.None;

    /// <summary>hub → UI 回填期间抑制 UI→hub 写回（防循环）</summary>
    private bool _syncingFromHub;

    /// <summary>设备列表（UI 绑定；刷新差异合并）</summary>
    public ObservableCollection<AdbDevice> Devices { get; } = [];

    /// <summary>选中设备（SelectedItemsBehavior 双向绑定；变化同步到会话中枢）</summary>
    public ObservableCollection<AdbDevice> SelectedDevices { get; } = [];

    [ObservableProperty]
    private bool _isDevicesExpanded = true;

    [ObservableProperty]
    private bool _isRefreshing;

    [ObservableProperty]
    private string _statusText = "就绪";

    /// <summary>当前模块是否支持多选（决定 ListBox SelectionMode）</summary>
    public bool IsMultiSelectEnabled =>
        _currentMode is DeviceSelectionMode.MultiOptional or DeviceSelectionMode.MultiRequired;

    public DeviceRailViewModel(
        IDeviceDirectory directory,
        IDeviceSessionHub hub,
        IAppLog log,
        IUiDispatcher ui,
        ISettingsStore settings)
    {
        _directory = directory;
        _hub = hub;
        _log = log;
        _ui = ui;
        _settings = settings;

        // UI 选择 → 会话中枢（防重入：回填期间不写回）
        SelectedDevices.CollectionChanged += (_, _) =>
        {
            if (_syncingFromHub)
                return;
            PushSelectionToHub();
        };

        // 中枢变化（后台线程）→ 编组回 UI 回填
        _hub.SelectionChanged += _ => _ui.Post(SyncFromHub);
        _hub.ActiveDeviceChanged += () => _ui.Post(SyncFromHub);

        // 目录变化 → 编组回 UI 差异合并
        _directory.DevicesChanged += () => _ui.Post(SyncFromDirectory);

        // G-P1-3：低频自动刷新（devices.autoRefresh 秒，0=关默认关；重启生效）
        var intervalSeconds = _settings.Get(SettingsScope.App, AutoRefreshKey, 0);
        if (intervalSeconds > 0)
        {
            _autoRefreshTimer = new System.Threading.Timer(
                _ => _ui.Post(() => _ = RefreshCoreAsync()),
                null,
                TimeSpan.FromSeconds(intervalSeconds),
                TimeSpan.FromSeconds(intervalSeconds));
        }
    }

    /// <summary>
    /// 导航切换：更新当前模块选择模式并回填其 scope 选择（P2-5 程序化回填）。
    /// 同时向会话中枢注册模块模式（hub 按声明模式归一化选择；未注册默认为 None 拒绝选择）。
    /// </summary>
    public void OnModuleChanged(string moduleId, DeviceSelectionMode mode)
    {
        _currentModuleId = moduleId;
        _currentMode = mode;
        _hub.SetModuleMode(moduleId, mode);
        OnPropertyChanged(nameof(IsMultiSelectEnabled));
        _ui.Post(SyncFromHub);
    }

    /// <summary>自动刷新设置键（秒，0=关闭）</summary>
    public const string AutoRefreshKey = "devices.autoRefresh";

    [RelayCommand]
    private async Task RefreshAsync() => await RefreshCoreAsync();

    /// <summary>扫描核心（手动刷新与自动轮询共用；防重入由目录 SemaphoreSlim 保证）</summary>
    private async Task RefreshCoreAsync()
    {
        if (IsRefreshing)
            return;

        IsRefreshing = true;
        StatusText = "正在扫描设备...";
        try
        {
            await _directory.RefreshAsync();
            // 状态文本与自动选中由 SyncFromDirectory（目录事件统一路径）处理
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

    // ==================== 内部 ====================

    /// <summary>UI 选中 → 中枢（按模式归一化由中枢完成）</summary>
    private void PushSelectionToHub()
    {
        if (_currentMode == DeviceSelectionMode.None)
            return;

        var serials = SelectedDevices.Where(d => d.IsOnline).Select(d => d.Serial).ToList();

        // 单击语义：全局焦点 = 第一个选中（Single* 与 Multi* 均适用）
        if (serials.Count > 0)
            _hub.SetActiveDevice(serials[0]);

        if (_currentModuleId.Length > 0)
        {
            _hub.SetSelection(_currentModuleId, new DeviceSelection(_currentMode, serials));
        }
    }

    /// <summary>中枢 → UI 回填（当前模块 scope + ActiveDevice）</summary>
    private void SyncFromHub()
    {
        if (_syncingFromHub)
            return;
        _syncingFromHub = true;
        try
        {
            var target = new List<AdbDevice>();

            // 多选模式：模块 scope 全量；单选模式：ActiveDevice（Single* 默认跟随全局焦点）
            if (IsMultiSelectEnabled)
            {
                var selection = _hub.GetSelection(_currentModuleId);
                target.AddRange(_directory.Devices.Where(d => selection.Serials.Contains(d.Serial)));
            }
            else if (_hub.ActiveDevice is { } active)
            {
                target.Add(active);
            }

            // 差异更新（避免全量重建闪烁）
            var current = SelectedDevices.ToList();
            if (!current.SequenceEqual(target))
            {
                SelectedDevices.Clear();
                foreach (var device in target)
                    SelectedDevices.Add(device);
            }
        }
        finally
        {
            _syncingFromHub = false;
        }
    }

    /// <summary>
    /// 目录快照 → UI 列表（差异合并：选中按 Serial 保留，仅同步变化项）。
    /// 目录变化统一路径：状态文本 + 自动选中也在此（任何刷新方式行为一致，P1-5）。
    /// </summary>
    private void SyncFromDirectory()
    {
        var serverDevices = _directory.Devices;
        var selectedSerials = SelectedDevices.Select(d => d.Serial).ToHashSet();

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

        // 状态文本统一（启动预热/用户刷新一致）
        StatusText = serverDevices.Count > 0 ? $"已连接 {serverDevices.Count} 台设备" : "未发现设备";

        // 选中回填：仍在线且原选中 → 保留（中枢已保活，此处只是 UI 同步）
        SyncFromHub();

        // 单设备自动选中（产线场景；无焦点时仅 1 台在线则自动选中）
        AutoSelectSingleDevice();
    }

    /// <summary>P1-5：产线场景单设备自动选中（仅当尚无全局焦点时）</summary>
    private void AutoSelectSingleDevice()
    {
        if (_hub.ActiveDevice is not null || _directory.Devices.Count != 1)
            return;

        var only = _directory.Devices[0];
        _hub.SetActiveDevice(only.Serial);
        if (_currentModuleId.Length > 0)
        {
            _hub.SetSelection(_currentModuleId, new DeviceSelection(_currentMode, [only.Serial]));
        }
        SyncFromHub();
    }
}
