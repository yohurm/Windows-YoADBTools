using Yovo.Platform.Abstractions.Composition;

namespace Yovo.Platform.Composition;

/// <summary>
/// 贡献注册表实现 — 模块 Contribute 阶段写入；Host 组装后 Shell 只读查询。
/// viewKey 重复即抛异常（fail-fast：视图映射是全局唯一命名空间）。
/// </summary>
public class ContributionRegistry : IContributionRegistry
{
    private readonly object _lock = new();
    private readonly List<NavigationContribution> _navigations = [];
    private readonly List<SettingsPageContribution> _settingsPages = [];
    private readonly List<StatusItemContribution> _statusItems = [];
    private readonly List<DeviceActionContribution> _deviceActions = [];
    private readonly List<CommandContribution> _commands = [];
    private readonly Dictionary<string, Type> _views = [];

    public IReadOnlyList<NavigationContribution> Navigations
    {
        get { lock (_lock) return _navigations.ToList(); }
    }

    public IReadOnlyList<SettingsPageContribution> SettingsPages
    {
        get { lock (_lock) return _settingsPages.ToList(); }
    }

    public IReadOnlyList<StatusItemContribution> StatusItems
    {
        get { lock (_lock) return _statusItems.ToList(); }
    }

    public IReadOnlyList<DeviceActionContribution> DeviceActions
    {
        get { lock (_lock) return _deviceActions.ToList(); }
    }

    public IReadOnlyList<CommandContribution> Commands
    {
        get { lock (_lock) return _commands.ToList(); }
    }

    public void Navigation(NavigationContribution contrib)
    {
        lock (_lock)
            _navigations.Add(contrib);
    }

    public void View(string viewKey, Type viewType)
    {
        lock (_lock)
        {
            if (!_views.TryAdd(viewKey, viewType))
                throw new InvalidOperationException($"视图键重复: {viewKey}");
        }
    }

    public void Command(CommandContribution contrib)
    {
        lock (_lock)
            _commands.Add(contrib);
    }

    public void SettingsPage(SettingsPageContribution contrib)
    {
        lock (_lock)
            _settingsPages.Add(contrib);
    }

    public void StatusItem(StatusItemContribution contrib)
    {
        lock (_lock)
            _statusItems.Add(contrib);
    }

    public void DeviceAction(DeviceActionContribution contrib)
    {
        lock (_lock)
            _deviceActions.Add(contrib);
    }

    public Type? FindView(string viewKey)
    {
        lock (_lock)
            return _views.GetValueOrDefault(viewKey);
    }
}
