using Microsoft.Extensions.DependencyInjection;
using Yovo.Modules.AdbTerminal.Application;
using Yovo.Modules.AdbTerminal.Presentation.ViewModels;
using Yovo.Modules.AdbTerminal.Presentation.Views;
using Yovo.Platform.Abstractions.Composition;
using Yovo.Platform.Abstractions.Devices;

namespace Yovo.Modules.AdbTerminal;

/// <summary>
/// ADB 命令终端模块 — 自治单元（v5 §13.1）。
/// ConfigureServices 注册模块服务；Contribute 声明导航与视图映射；
/// 设备模式 MultiOptional（多选并行）；能力 MainView + DetachedWindow + MultiDevice。
/// </summary>
public sealed class AdbTerminalModule : IModule
{
    /// <summary>模块唯一标识（单点常量：日志 Source / 设置命名空间 / 数据目录同源）</summary>
    public const string ModuleId = "adb-terminal";

    public ModuleDescriptor Descriptor { get; } = new(
        ModuleId,
        "ADB 命令终端",
        "", // Segoe MDL2: 开发者图标
        SortOrder: 0,
        ModuleCapability.MainView | ModuleCapability.DetachedWindow | ModuleCapability.MultiDeviceSupported,
        DeviceSelectionMode.MultiOptional);

    public void ConfigureServices(IServiceCollection services, IModuleHostContext host)
    {
        services.AddSingleton<CommandRepository>();
        services.AddSingleton<ExecutionService>();
        services.AddSingleton<TerminalViewModel>();
    }

    public void Contribute(IContributionRegistrar registrar, IServiceProvider services)
    {
        registrar.View("TerminalView", typeof(TerminalView));
        registrar.View("CommandManagerWindow", typeof(CommandManagerWindow));

        registrar.Navigation(new NavigationContribution(
            ModuleId, Descriptor.Title, Descriptor.IconGlyph, Descriptor.SortOrder,
            sp => sp.GetRequiredService<TerminalViewModel>(),
            "TerminalView"));
    }

    public Task InitializeAsync(IServiceProvider services, CancellationToken ct) => Task.CompletedTask;

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
