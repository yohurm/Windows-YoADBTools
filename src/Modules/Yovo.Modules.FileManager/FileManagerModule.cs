using Microsoft.Extensions.DependencyInjection;
using Yovo.Modules.FileManager.Application;
using Yovo.Modules.FileManager.Presentation.ViewModels;
using Yovo.Modules.FileManager.Presentation.Views;
using Yovo.Platform.Abstractions.Composition;
using Yovo.Platform.Abstractions.Devices;

namespace Yovo.Modules.FileManager;

/// <summary>
/// 文件管理模块 — 自治单元（v5 §13.3）。
/// 浏览设备文件系统、push/pull 传输（进度 → 后台任务）、删除/新建（安全根 + 确认）。
/// 设备模式 SingleRequired（全局焦点设备）。
/// </summary>
public sealed class FileManagerModule : IModule
{
    /// <summary>模块唯一标识（单点常量）</summary>
    public const string ModuleId = "file-manager";

    public ModuleDescriptor Descriptor { get; } = new(
        ModuleId,
        "文件管理",
        "", // Segoe MDL2: 文件夹图标
        SortOrder: 10,
        ModuleCapability.MainView | ModuleCapability.BackgroundRunnable | ModuleCapability.MultiDeviceSupported,
        DeviceSelectionMode.SingleRequired);

    public void ConfigureServices(IServiceCollection services, IModuleHostContext host)
    {
        services.AddSingleton<RemoteFileService>();
        services.AddSingleton<TransferRunner>();
        services.AddSingleton<FileManagerViewModel>();
    }

    public void Contribute(IContributionRegistrar registrar, IServiceProvider services)
    {
        registrar.View("FileManagerView", typeof(FileManagerView));

        registrar.Navigation(new NavigationContribution(
            ModuleId, Descriptor.Title, Descriptor.IconGlyph, Descriptor.SortOrder,
            sp => sp.GetRequiredService<FileManagerViewModel>(),
            "FileManagerView"));
    }

    public Task InitializeAsync(IServiceProvider services, CancellationToken ct) => Task.CompletedTask;

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
