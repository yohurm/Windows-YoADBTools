using Microsoft.Extensions.DependencyInjection;
using Yovo.Modules.LogAnalyzer.Application;
using Yovo.Modules.LogAnalyzer.Presentation.ViewModels;
using Yovo.Modules.LogAnalyzer.Presentation.Views;
using Yovo.Platform.Abstractions.Composition;
using Yovo.Platform.Abstractions.Devices;

namespace Yovo.Modules.LogAnalyzer;

/// <summary>
/// 日志分析模块 — 自治单元（v5 §13.4 + 多窗口架构 M1）。
/// 设备级单流采集（ADR-LA-001）→ 多会话扇出（Xshell 式 Tab，按包名/PID 划分）；
/// 进程索引（包名↔PID 重绑）、AS 风格过滤栏（级别/包名/PID/检索）。
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
        ModuleCapability.MainView | ModuleCapability.BackgroundRunnable | ModuleCapability.SingleDevicePreferred,
        DeviceSelectionMode.SingleRequired); // L6：能力位与 SingleRequired 模式一致

    public void ConfigureServices(IServiceCollection services, IModuleHostContext host)
    {
        // 域层单例（采集单流 / 进程索引 / 会话工作区）；LogSessionViewModel 由工作区主机工厂创建
        services.AddSingleton<DeviceCaptureService>();
        services.AddSingleton<ProcessIndexService>();
        services.AddSingleton<LogWorkspace>();
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

    public Task InitializeAsync(IServiceProvider services, CancellationToken ct)
    {
        _services = services; // 退出清理需要访问模块服务
        return Task.CompletedTask;
    }

    /// <summary>退出清理（H2）：停止 logcat 采集与进程索引，避免 adb 残留</summary>
    public ValueTask DisposeAsync()
    {
        _services?.GetService<DeviceCaptureService>()?.Stop();
        _services?.GetService<ProcessIndexService>()?.Stop();
        return ValueTask.CompletedTask;
    }

    private IServiceProvider? _services;
}
