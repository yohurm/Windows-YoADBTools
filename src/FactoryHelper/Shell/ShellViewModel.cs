using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Controls;
using FactoryHelper.Core;

namespace FactoryHelper.Shell;

/// <summary>
/// 导航项 — 右侧统一操作面板的统一入口（真实模块 / 预留模块 / 平台面板）。
/// 三要素：标题 + 图标 + 视图工厂。点击导航 → CreateView → 内容区显示。
/// </summary>
public sealed class NavModuleItem
{
    public string Title { get; }
    public string IconGlyph { get; }
    private readonly Func<UserControl> _createView;

    public NavModuleItem(string title, string iconGlyph, Func<UserControl> createView)
    {
        Title = title;
        IconGlyph = iconGlyph;
        _createView = createView;
    }

    /// <summary>创建面板视图（真实模块懒创建单实例；占位/设置面板每次进入重建）</summary>
    public UserControl CreateView() => _createView();

    /// <summary>UIA 辅助功能可访问名称</summary>
    public override string ToString() => Title;
}

/// <summary>
/// Shell 导航 ViewModel — 右侧统一操作面板的导航模型。
/// 导航顺序：业务模块（SortOrder）→ 预留模块 → 平台面板（设置）。
/// 设备面板职责在 DevicePanelViewModel，不在此混入。
/// </summary>
public partial class ShellViewModel : INotifyPropertyChanged
{
    private NavModuleItem? _selectedModule;
    private UserControl? _currentView;

    /// <summary>导航列表（业务模块 + 预留 + 设置）</summary>
    public ObservableCollection<NavModuleItem> Modules { get; } = [];

    /// <summary>设备面板（组合持有，Shell 左侧公共区）</summary>
    public DevicePanelViewModel DevicePanel { get; }

    private readonly SettingsViewModel _settingsVm;

    /// <summary>当前选中导航项（切换时懒创建视图）</summary>
    public NavModuleItem? SelectedModule
    {
        get => _selectedModule;
        set
        {
            _selectedModule = value;
            OnPropertyChanged();
            CurrentView = value?.CreateView();
        }
    }

    /// <summary>右侧操作面板当前视图</summary>
    public UserControl? CurrentView
    {
        get => _currentView;
        private set { _currentView = value; OnPropertyChanged(); }
    }

    public ShellViewModel(
        ModuleRegistry registry,
        IEnumerable<PlannedModule>? planned,
        DevicePanelViewModel devicePanel,
        SettingsViewModel settingsVm)
    {
        DevicePanel = devicePanel;
        _settingsVm = settingsVm;

        // 1. 业务模块（已注册，按 SortOrder；模块自持单实例视图）
        foreach (var module in registry.Modules.OrderBy(m => m.SortOrder))
            Modules.Add(new NavModuleItem(module.Title, module.IconGlyph, module.CreateView));

        // 2. 预留模块（未注册的同 Id 项 → 占位入口；已注册被真实项替换）
        var registeredIds = registry.Modules.Select(m => m.Id).ToHashSet();
        foreach (var item in planned ?? [])
        {
            if (!registeredIds.Contains(item.Id))
                Modules.Add(new NavModuleItem(item.Title, item.IconGlyph, () => new PlannedModuleView(item)));
        }

        // 3. 平台面板：设置（导航-内容框架统一承载）
        Modules.Add(new NavModuleItem("设置", "", () => new SettingsView(_settingsVm)));

        SelectedModule = Modules.FirstOrDefault();
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
