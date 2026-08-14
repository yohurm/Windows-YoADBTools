namespace Yovo.Platform.Abstractions.Composition;

/// <summary>
/// 贡献注册表（查询端）— Host 组装完成后，Shell 读取全部贡献构建导航/状态栏。
/// 注册端由模块的 IModule.Contribute 调用（同一实例，IContributionRegistrar 是其子集）。
/// </summary>
public interface IContributionRegistry : IContributionRegistrar
{
    IReadOnlyList<NavigationContribution> Navigations { get; }
    IReadOnlyList<SettingsPageContribution> SettingsPages { get; }
    IReadOnlyList<StatusItemContribution> StatusItems { get; }
    IReadOnlyList<DeviceActionContribution> DeviceActions { get; }
    IReadOnlyList<CommandContribution> Commands { get; }

    /// <summary>按 viewKey 查视图类型（未注册返回 null）</summary>
    Type? FindView(string viewKey);
}
