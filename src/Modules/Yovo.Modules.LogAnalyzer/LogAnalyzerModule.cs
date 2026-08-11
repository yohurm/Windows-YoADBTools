using Microsoft.Extensions.DependencyInjection;
using Yovo.Modules.LogAnalyzer.Application;
using Yovo.Modules.LogAnalyzer.Presentation.ViewModels;
using Yovo.Modules.LogAnalyzer.Presentation.Views;
using Yovo.Platform.Abstractions.Composition;
using Yovo.Platform.Abstractions.Devices;

namespace Yovo.Modules.LogAnalyzer;

/// <summary>
/// 日志分析模块 — 自治单元（v5 §13.4）。
/// 流式 logcat 采集（IAdbStreamingExecutor）、环形缓冲、过滤、暂停/清空/导出。
/// 设备模式 SingleRequired（全局焦点）；采集期间登记后台任务（BackgroundRunnable）。
/// </summary>
public sealed class LogAnalyzerModule : IModule
{
    /// <summary>模块唯一标识（单点常量）</summary>
    public const string ModuleId = "log-analyzer";

    public ModuleDescriptor Descriptor { get; } = new(
        ModuleId,
        "日志分析",
        "", // Segoe MDL2: 日志图标
        SortOrder: 20,
        ModuleCapability.MainView | ModuleCapability.BackgroundRunnable | ModuleCapability.MultiDeviceSupported,
        DeviceSelectionMode.SingleRequired);

    public void ConfigureServices(IServiceCollection services, IModuleHostContext host)
    {
        services.AddSingleton<LogcatCaptureService>();
        services.AddSingleton<LogAnalyzerViewModel>();
    }

    public void Contribute(IContributionRegistrar registrar, IServiceProvider services)
    {
        registrar.View("LogAnalyzerView", typeof(LogAnalyzerView));

        registrar.Navigation(new NavigationContribution(
            ModuleId, Descriptor.Title, Descriptor.IconGlyph, Descriptor.SortOrder,
            sp => sp.GetRequiredService<LogAnalyzerViewModel>(),
            "LogAnalyzerView"));
    }

    public Task InitializeAsync(IServiceProvider services, CancellationToken ct) => Task.CompletedTask;

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
