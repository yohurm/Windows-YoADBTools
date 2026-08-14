using Microsoft.Extensions.DependencyInjection;
using Yovo.Platform.Abstractions.Composition;
using Yovo.Platform.Abstractions.Devices;
using Yovo.Shell.ViewModels;
using Yovo.Shell.Views;

namespace Yovo.Shell;

/// <summary>
/// 通用预留模块 — IsPlanned=true 的轻量 IModule（v5 §8.4）。
/// 只贡献导航 + "开发中"占位页；不注册业务服务、不建模块项目。
/// 将来立项时：新建真实模块替换同 Id 占位即可（Catalog 不得同时存在同 Id）。
/// </summary>
public sealed class PlannedModule(string id, string title, string iconGlyph, int sortOrder) : IModule
{
    public ModuleDescriptor Descriptor { get; } = new(
        id, title, iconGlyph, sortOrder,
        ModuleCapability.None, DeviceSelectionMode.None, IsPlanned: true);

    public void ConfigureServices(IServiceCollection services, IModuleHostContext host)
    {
        // 占位模块无业务服务
    }

    public void Contribute(IContributionRegistrar registrar, IServiceProvider services)
    {
        registrar.View("PlannedPlaceholderView", typeof(PlannedPlaceholderView));
        registrar.Navigation(new NavigationContribution(
            Descriptor.Id, Descriptor.Title, Descriptor.IconGlyph, Descriptor.SortOrder,
            _ => new PlannedViewModel(Descriptor.Title),
            "PlannedPlaceholderView"));
    }

    public Task InitializeAsync(IServiceProvider services, CancellationToken ct) => Task.CompletedTask;

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
