using System.IO;
using System.Reflection;
using System.Windows;
using Microsoft.Extensions.DependencyInjection;
using Yovo.Platform;
using Yovo.Platform.Abstractions;
using Yovo.Platform.Abstractions.Composition;
using Yovo.Platform.Abstractions.Tools;
using Yovo.Shell;
using Yovo.Shell.Views;

namespace Yovo.Host;

/// <summary>
/// 组合根 — 启动序列（v5 §15.1）：
/// AddPlatform → 模块 ConfigureServices → Build → Contribute → InitializeAsync → 主窗口。
/// 退出序列：ShutdownToken 取消 → 模块 DisposeAsync → DI 释放。
/// </summary>
public partial class App : Application
{
    private ServiceProvider? _provider;
    private IReadOnlyList<IModule>? _modules;
    private CancellationTokenSource? _shutdownCts;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // 全局未处理异常（H5）：写日志 → 提示 → 退出。
        // 到达此处的都是不可恢复异常：继续运行会处于半损坏状态，二次故障更难查。
        DispatcherUnhandledException += (_, args) =>
        {
            try
            {
                var logDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "YovoAdbTools", "logs");
                Directory.CreateDirectory(logDir);
                File.WriteAllText(Path.Combine(logDir, $"crash-{DateTime.Now:yyyyMMdd-HHmmss}.log"),
                    $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {args.Exception}");
            }
            catch
            {
                // 日志写入失败不阻断退出流程
            }

            MessageBox.Show(
                $"发生未处理的错误，应用将退出。\n\n{args.Exception.Message}\n\n详细堆栈已写入日志目录。",
                "Yovo ADB Tools — 错误",
                MessageBoxButton.OK,
                MessageBoxImage.Error);

            args.Handled = true;
            Shutdown(-1); // 触发 OnExit 清理序列（模块 Dispose/传输取消）后退出
        };

        var appVersion = typeof(App).Assembly.GetName().Version ?? new Version(1, 0, 0);
        _shutdownCts = new CancellationTokenSource();
        var hostContext = new ModuleHostContext("Yovo ADB Tools", appVersion, _shutdownCts.Token);

        // ===== 组装 =====
        var services = new ServiceCollection();
        services.AddSingleton<IAppLifecycle>(new AppLifecycle(_shutdownCts.Token));
        services.AddPlatform();
        services.AddShell("Yovo ADB Tools", appVersion);

        _modules = ModuleCatalog.CreateAll();
        foreach (var module in _modules)
        {
            module.ConfigureServices(services, hostContext);
            services.AddSingleton<IModule>(module);
        }

        _provider = services.BuildServiceProvider();

        // ===== 贡献点（模块 → 注册表；Shell 平台设置页最后登记） =====
        var registrar = _provider.GetRequiredService<IContributionRegistry>();
        foreach (var module in _modules)
            module.Contribute(registrar, _provider);
        _provider.GetRequiredService<ShellContributions>().RegisterPlatformSettings();

        // ===== 模块初始化（异步，不阻塞窗口显示） =====
        foreach (var module in _modules)
            _ = InitializeModuleAsync(module);

        // ===== 设备预热：ADB 解压 + 首次扫描（fire-and-forget） =====
        _ = WarmUpAsync();

        // ===== 主窗口 =====
        var main = _provider.GetRequiredService<MainWindow>();
        MainWindow = main;
        main.Show();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        // 退出序列：请求取消 → 模块 DisposeAsync（逆序）→ DI 释放
        _shutdownCts?.Cancel();
        if (_modules is not null)
        {
            foreach (var module in _modules.Reverse())
            {
                try
                {
                    module.DisposeAsync().AsTask().GetAwaiter().GetResult();
                }
                catch
                {
                    // 模块释放异常不阻断退出
                }
            }
        }
        _provider?.Dispose();
        base.OnExit(e);
    }

    private async Task InitializeModuleAsync(IModule module)
    {
        try
        {
            await module.InitializeAsync(_provider!, _shutdownCts!.Token);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"模块初始化失败: {module.Descriptor.Id}: {ex.Message}");
        }
    }

    private async Task WarmUpAsync()
    {
        try
        {
            // 预解压 ADB（单文件发布场景首次启动可能耗时，异步进行不阻塞 UI）
            await _provider!.GetRequiredService<IToolResolver>()
                .EnsureExtractedAsync(ToolId.Adb, _shutdownCts!.Token);

            // 首次设备扫描（设备栏 RefreshCommand 也会触发；此处兜底启动即扫描）
            await _provider!.GetRequiredService<Yovo.Platform.Abstractions.Devices.IDeviceDirectory>()
                .RefreshAsync(_shutdownCts!.Token);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"设备预热失败: {ex.Message}");
        }
    }
}
