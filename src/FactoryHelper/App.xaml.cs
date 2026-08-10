using System.Windows;
using Microsoft.Extensions.DependencyInjection;
using FactoryHelper.Core;
using FactoryHelper.Modules.AdbTerminal;
using FactoryHelper.Services;
using FactoryHelper.ViewModels;

namespace FactoryHelper;

public partial class App : Application
{
    public static ServiceProvider ServiceProvider { get; private set; } = null!;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        var services = new ServiceCollection();

        // ===== 平台级共享服务 =====
        services.AddSingleton<IAdbService, AdbService>();
        services.AddSingleton<ILogService, LogService>();
        services.AddSingleton<ISettingsService, SettingsService>();

        // ===== 终端模块服务 =====
        services.AddSingleton<ICommandLibraryService, CommandLibraryService>();
        services.AddSingleton<IExecutionService, ExecutionService>();

        // ===== ViewModel =====
        services.AddSingleton<ShellViewModel>();

        ServiceProvider = services.BuildServiceProvider();

        // ===== 模块注册（新增模块在此登记） =====
        var registry = new ModuleRegistry();
        var context = new ModuleContext(
            ServiceProvider.GetRequiredService<IAdbService>(),
            ServiceProvider.GetRequiredService<ILogService>(),
            ServiceProvider.GetRequiredService<ISettingsService>(),
            ServiceProvider.GetRequiredService<ICommandLibraryService>(),
            ServiceProvider.GetRequiredService<IExecutionService>());

        registry.Register(new AdbTerminalModule());
        // registry.Register(new ScreenMirrorModule()); // 预留：投屏模块

        foreach (var module in registry.Modules)
            module.Initialize(context);

        var mainWindow = new MainWindow(
            new ShellViewModel(registry, ServiceProvider.GetRequiredService<IAdbService>()));
        mainWindow.Show();
    }
}

/// <summary>平台模块上下文实现</summary>
internal class ModuleContext(
    IAdbService adb,
    ILogService log,
    ISettingsService settings,
    ICommandLibraryService commandLibrary,
    IExecutionService execution) : IModuleContext
{
    public IAdbService Adb { get; } = adb;
    public ILogService Log { get; } = log;
    public ISettingsService Settings { get; } = settings;
    public ICommandLibraryService CommandLibrary { get; } = commandLibrary;
    public IExecutionService Execution { get; } = execution;
}