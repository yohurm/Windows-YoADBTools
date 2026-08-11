using System.Windows;
using FactoryHelper.Core;
using FactoryHelper.Modules.AdbTerminal;
using FactoryHelper.Platform;
using FactoryHelper.Shell;

namespace FactoryHelper;

public partial class App : Application
{
    private LogService? _log;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // ===== 平台服务（4 个，手工组装——简单直接，无需容器） =====
        var adb = new AdbProcessService();
        var devices = new DeviceService(adb);
        _log = new LogService();
        var settings = new SettingsService();
        var context = new ModuleContext(adb, devices, _log, settings);

        // ===== 模块注册（新增模块在此登记，Id 唯一性由 ModuleRegistry 强制） =====
        var registry = new ModuleRegistry();
        registry.Register(new AdbTerminalModule());
        registry.InitializeAll(context);

        // ===== Shell =====
        var devicePanel = new DevicePanelViewModel(devices, _log);
        var shell = new ShellViewModel(registry, devicePanel);
        new MainWindow(shell).Show();

        // 启动即扫描设备（VM 内部捕获异常，安全 fire-and-forget）
        _ = devicePanel.RefreshCommand.ExecuteAsync(null);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _log?.Dispose(); // 日志后台落盘最终刷新
        base.OnExit(e);
    }
}

/// <summary>模块上下文实现（组合根）：平台向模块暴露的 4 个能力</summary>
internal class ModuleContext(
    IAdbProcessService adb, IDeviceService devices, ILogService log, ISettingsService settings)
    : IModuleContext
{
    public IAdbProcessService Adb { get; } = adb;
    public IDeviceService Devices { get; } = devices;
    public ILogService Log { get; } = log;
    public ISettingsService Settings { get; } = settings;
}
