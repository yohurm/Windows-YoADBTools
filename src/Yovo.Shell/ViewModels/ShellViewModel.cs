using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using Yovo.Platform.Abstractions.Composition;
using Yovo.Platform.Abstractions.Devices;

namespace Yovo.Shell.ViewModels;

/// <summary>导航项 — 业务模块 / 预留占位 / 设置页的统一建模（贡献点聚合结果）</summary>
public sealed record NavItem(
    string ModuleId,
    string Title,
    string IconGlyph,
    string ViewKey,
    object ViewModel,
    DeviceSelectionMode SelectionMode,
    bool IsPlanned)
{
    public override string ToString() => Title; // UIA 可访问名称（P2-3）
}

/// <summary>
/// Shell 导航 ViewModel — 工作台壳的导航模型（无 WPF 依赖，可无头测试）。
/// 构建算法（v5 §12.4）：模块导航（含占位）按 SortOrder → 设置页贡献。
/// 切换导航：失活旧模块 → 通知 View 层渲染 → 激活新模块 → 同步设备栏模式。
/// 视图渲染由 MainWindow（View 层）订阅 NavigationChanged 完成。
/// </summary>
public partial class ShellViewModel : ObservableObject
{
    private readonly IReadOnlyDictionary<string, IModule> _modules;

    /// <summary>导航列表（模块 + 设置页）</summary>
    public ObservableCollection<NavItem> Items { get; } = [];

    /// <summary>设备栏（Shell 左栏公共区）</summary>
    public DeviceRailViewModel DeviceRail { get; }

    /// <summary>状态栏</summary>
    public StatusBarViewModel StatusBar { get; }

    /// <summary>切换导航时触发（View 层订阅渲染）</summary>
    public event Action<NavItem>? NavigationChanged;

    private NavItem? _selectedItem;

    public NavItem? SelectedItem
    {
        get => _selectedItem;
        set
        {
            if (_selectedItem == value)
                return;
            var previous = _selectedItem;
            _selectedItem = value;
            OnPropertyChanged();

            if (value is null)
                return;

            // 1. 失活旧模块（若实现 IModuleActivation）
            if (previous is not null && _modules.TryGetValue(previous.ModuleId, out var prevModule)
                && prevModule is IModuleActivation prevActivation)
            {
                _ = prevActivation.OnDeactivatedAsync(CancellationToken.None);
            }

            // 2. 通知 View 层渲染新视图
            NavigationChanged?.Invoke(value);

            // 3. 设备栏切换为当前模块的选择模式
            DeviceRail.OnModuleChanged(value.ModuleId, value.SelectionMode);

            // 4. 激活新模块
            if (_modules.TryGetValue(value.ModuleId, out var module) && module is IModuleActivation activation)
            {
                _ = activation.OnActivatedAsync(CancellationToken.None);
            }
        }
    }

    public ShellViewModel(
        IEnumerable<IModule> modules,
        IContributionRegistry registry,
        IServiceProvider services,
        DeviceRailViewModel deviceRail,
        StatusBarViewModel statusBar)
    {
        _modules = modules.ToDictionary(m => m.Descriptor.Id);
        DeviceRail = deviceRail;
        StatusBar = statusBar;

        // 1. 模块导航贡献（含 Planned 占位 — 由模块 Contribute 声明）
        foreach (var nav in registry.Navigations.OrderBy(n => n.SortOrder))
        {
            var descriptor = _modules.GetValueOrDefault(nav.ModuleId)?.Descriptor;
            Items.Add(new NavItem(
                nav.ModuleId, nav.Title, nav.IconGlyph, nav.ViewKey,
                nav.ViewModelFactory(services),
                descriptor?.DeviceSelectionMode ?? DeviceSelectionMode.None,
                descriptor?.IsPlanned ?? false));
        }

        // 2. 设置页贡献（平台设置由 Shell 内部注册；模块设置走同通道）
        foreach (var page in registry.SettingsPages.OrderBy(p => p.SortOrder))
        {
            Items.Add(new NavItem(
                page.ModuleId, page.Title, page.IconGlyph, page.ViewKey,
                page.ViewModelFactory(services),
                DeviceSelectionMode.None, IsPlanned: false));
        }

        // 3. 默认选中第一项
        SelectedItem = Items.FirstOrDefault();
    }
}
