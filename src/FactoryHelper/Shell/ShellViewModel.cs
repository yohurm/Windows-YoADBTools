using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Controls;
using FactoryHelper.Core;

namespace FactoryHelper.Shell;

/// <summary>
/// 导航模块项 — 真实模块或预留模块（占位）。
/// 同 Id 时真实模块优先：未来注册真实模块后预留项自动被替换。
/// </summary>
public sealed class NavModuleItem(IModule? module, PlannedModule? planned)
{
    public IModule? Module { get; } = module;
    public PlannedModule? Planned { get; } = planned;

    public string Title => Module?.Title ?? Planned!.Title;
    public string IconGlyph => Module?.IconGlyph ?? Planned!.IconGlyph;

    /// <summary>创建视图：真实模块懒创建；预留模块显示占位</summary>
    public UserControl CreateView()
        => Module is not null ? Module.CreateView() : new PlannedModuleView(Planned!);

    /// <summary>UIA 辅助功能可访问名称（ListBox 项的 Name）</summary>
    public override string ToString() => Title;
}

/// <summary>
/// Shell 导航 ViewModel — 模块列表（真实 + 预留）+ 当前视图切换。
/// 设备面板职责在 DevicePanelViewModel，不在此混入。
/// </summary>
public class ShellViewModel : INotifyPropertyChanged
{
    private NavModuleItem? _selectedModule;
    private UserControl? _currentView;

    /// <summary>导航模块列表（真实模块按 SortOrder 在前，预留模块在后）</summary>
    public ObservableCollection<NavModuleItem> Modules { get; } = [];

    /// <summary>设备面板（组合持有，Shell 左侧公共区）</summary>
    public DevicePanelViewModel DevicePanel { get; }

    /// <summary>当前选中导航项（切换时懒创建视图，单实例复用）</summary>
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

    /// <summary>模块内容区当前视图</summary>
    public UserControl? CurrentView
    {
        get => _currentView;
        private set { _currentView = value; OnPropertyChanged(); }
    }

    public ShellViewModel(ModuleRegistry registry, IEnumerable<PlannedModule>? planned, DevicePanelViewModel devicePanel)
    {
        DevicePanel = devicePanel;

        // 真实模块（已注册，按 SortOrder）
        foreach (var module in registry.Modules.OrderBy(m => m.SortOrder))
            Modules.Add(new NavModuleItem(module, null));

        // 预留模块（未注册的同 Id 项 → 占位入口；已注册的同 Id 被真实项替换，不重复显示）
        var registeredIds = registry.Modules.Select(m => m.Id).ToHashSet();
        foreach (var item in planned ?? [])
        {
            if (!registeredIds.Contains(item.Id))
                Modules.Add(new NavModuleItem(null, item));
        }

        SelectedModule = Modules.FirstOrDefault();
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
