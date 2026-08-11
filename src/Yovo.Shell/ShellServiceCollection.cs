using Microsoft.Extensions.DependencyInjection;
using Yovo.Platform.Abstractions;
using Yovo.Platform.Abstractions.Composition;
using Yovo.Platform.Abstractions.Tasks;
using Yovo.Shell.Services;
using Yovo.Shell.ViewModels;
using Yovo.Shell.Views;

namespace Yovo.Shell;

/// <summary>Shell DI 注册 — 工作台壳（导航/设备栏/状态栏/窗口/视图解析）</summary>
public static class ShellServiceCollection
{
    public static IServiceCollection AddShell(this IServiceCollection services,
        string applicationName, Version applicationVersion)
    {
        // 平台 UI 端口（Shell 实现）
        services.AddSingleton<IUiDispatcher, WpfUiDispatcher>();
        services.AddSingleton<IWindowService, WindowService>();
        services.AddSingleton<ViewLocator>();
        services.AddSingleton<ShellContributions>();

        // Shell ViewModel（单例 — 导航切换不丢状态）
        services.AddSingleton<DeviceRailViewModel>();
        services.AddSingleton(sp => new StatusBarViewModel(
            sp.GetRequiredService<IBackgroundTaskCenter>(),
            sp.GetRequiredService<IUiDispatcher>(),
            applicationName, applicationVersion));
        services.AddSingleton<SettingsViewModel>();
        services.AddSingleton<ShellViewModel>(); // 注入 IEnumerable&lt;IModule&gt;（Host 注册全部模块实例）

        // 主窗口
        services.AddSingleton<MainWindow>();

        return services;
    }
}
