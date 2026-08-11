using Yovo.Platform.Abstractions.Devices;

namespace Yovo.Platform.Abstractions.Composition;

/// <summary>
/// 贡献注册端 — 模块在 Contribute 阶段声明对 Shell 的扩展点。
/// 全部强类型；契约层不含任何 WPF 类型（视图通过 ViewKey 映射，VM 通过工厂产生）。
/// </summary>
public interface IContributionRegistrar
{
    /// <summary>导航项（主内容区页签）</summary>
    void Navigation(NavigationContribution contrib);

    /// <summary>视图映射（viewKey → View 类型，Shell 的 ViewLocator 查询用）</summary>
    void View(string viewKey, Type viewType);

    /// <summary>命令贡献（工具栏/命令面板，二期渲染）</summary>
    void Command(CommandContribution contrib);

    /// <summary>设置页贡献（导航"设置"分组）</summary>
    void SettingsPage(SettingsPageContribution contrib);

    /// <summary>状态栏项贡献</summary>
    void StatusItem(StatusItemContribution contrib);

    /// <summary>设备右键/更多操作贡献</summary>
    void DeviceAction(DeviceActionContribution contrib);
}

/// <summary>导航贡献 — 非 UI 类型：VM 由工厂创建，View 由 ViewKey 经 ViewLocator 解析</summary>
public sealed record NavigationContribution(
    string ModuleId,
    string Title,
    string IconGlyph,
    int SortOrder,
    Func<IServiceProvider, object> ViewModelFactory,
    string ViewKey);

/// <summary>设置页贡献（平台设置由 Shell 内部注册；模块设置走此通道）</summary>
public sealed record SettingsPageContribution(
    string ModuleId,
    string Title,
    string IconGlyph,
    int SortOrder,
    Func<IServiceProvider, object> ViewModelFactory,
    string ViewKey);

/// <summary>命令贡献（元数据 + VM 工厂；渲染由 Shell 二期实现）</summary>
public sealed record CommandContribution(
    string ModuleId,
    string Id,
    string Title,
    Func<IServiceProvider, object> ViewModelFactory);

/// <summary>状态栏项贡献</summary>
public sealed record StatusItemContribution(
    string ModuleId,
    string Id,
    int SortOrder,
    Func<IServiceProvider, object> ViewModelFactory,
    string ViewKey);

/// <summary>设备右键操作贡献</summary>
public sealed record DeviceActionContribution(
    string ModuleId,
    string Title,
    int SortOrder,
    Action<DeviceSerial> Action);
