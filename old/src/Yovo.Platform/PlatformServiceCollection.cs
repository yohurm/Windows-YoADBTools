using Microsoft.Extensions.DependencyInjection;
using Yovo.Platform.Abstractions;
using Yovo.Platform.Abstractions.Adb;
using Yovo.Platform.Abstractions.Composition;
using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Logging;
using Yovo.Platform.Abstractions.Messaging;
using Yovo.Platform.Abstractions.Process;
using Yovo.Platform.Abstractions.Settings;
using Yovo.Platform.Abstractions.Tasks;
using Yovo.Platform.Abstractions.Tools;
using Yovo.Platform.Adb;
using Yovo.Platform.Composition;
using Yovo.Platform.Devices;
using Yovo.Platform.Logging;
using Yovo.Platform.Messaging;
using Yovo.Platform.Process;
using Yovo.Platform.Settings;
using Yovo.Platform.Tasks;
using Yovo.Platform.Tools;

namespace Yovo.Platform;

/// <summary>
/// 平台内核 DI 注册 — Host 组合根调用；全部平台服务 Singleton。
/// </summary>
public static class PlatformServiceCollection
{
    public static IServiceCollection AddPlatform(this IServiceCollection services)
    {
        // 路径与设置（无依赖，先注册）
        services.AddSingleton<IAppPaths, AppPaths>();
        services.AddSingleton<ISettingsStore, SettingsStore>();

        // 消息总线（设备/后台任务广播依赖）
        services.AddSingleton<IEventBus, EventBus>();

        // 进程与工具（ADB 客户端依赖）
        services.AddSingleton<IProcessRunner, ProcessRunner>();
        services.AddSingleton<IToolResolver, ToolResolver>();

        // ADB 并发限流（§10.1：默认并行度 4，设置 adb.concurrency 可调）
        services.AddSingleton<IAdbConcurrencyLimiter, AdbConcurrencyLimiter>();

        // ADB 客户端：实现单例，五个接口面共享同一实例（ISP 切片）
        services.AddSingleton<AdbClient>();
        services.AddSingleton<IAdbClient>(sp => sp.GetRequiredService<AdbClient>());
        services.AddSingleton<IAdbCommandExecutor>(sp => sp.GetRequiredService<AdbClient>());
        services.AddSingleton<IAdbStreamingExecutor>(sp => sp.GetRequiredService<AdbClient>());
        services.AddSingleton<IAdbTransfer>(sp => sp.GetRequiredService<AdbClient>());
        services.AddSingleton<IAdbTunnel>(sp => sp.GetRequiredService<AdbClient>());

        // 设备：目录与会话分离（会话订阅总线保活，无循环依赖）
        services.AddSingleton<IDeviceDirectory, DeviceDirectory>();
        services.AddSingleton<IDeviceSessionHub, DeviceSessionHub>();

        // 基础设施
        services.AddSingleton<IAppLog, AppLogService>();
        services.AddSingleton<IBackgroundTaskCenter, BackgroundTaskCenter>();
        services.AddSingleton<IContributionRegistry, ContributionRegistry>();

        return services;
    }
}
