using Microsoft.Extensions.DependencyInjection;
using Yovo.Platform.Abstractions.Devices;

namespace Yovo.Platform.Abstractions.Composition;

/// <summary>
/// 模块契约 — Host 通过 ModuleCatalog 创建，按固定生命周期驱动。
/// 模块是自治单元：ConfigureServices 注册自身服务，Contribute 声明贡献点，
/// InitializeAsync 加载数据（幂等），DisposeAsync 释放资源。
/// 模块间禁止互相引用；只依赖 Platform.Abstractions。
/// </summary>
public interface IModule
{
    /// <summary>模块元数据（导航构建在 Initialize 前即可读，不必跑 View）</summary>
    ModuleDescriptor Descriptor { get; }

    /// <summary>向 DI 注册本模块服务（可多次调用安全）</summary>
    void ConfigureServices(IServiceCollection services, IModuleHostContext host);

    /// <summary>从 DI 解析后登记贡献点（导航、视图映射、设置页等）</summary>
    void Contribute(IContributionRegistrar registrar, IServiceProvider services);

    /// <summary>模块级启动（加载库、预热），幂等</summary>
    Task InitializeAsync(IServiceProvider services, CancellationToken ct);

    /// <summary>应用退出或模块禁用时</summary>
    ValueTask DisposeAsync();
}

/// <summary>模块元数据（稳定 Id 单点；导航三要素 + 能力声明）</summary>
public sealed record ModuleDescriptor(
    string Id,                       // 稳定 Id：adb-terminal / file-manager / log-analyzer / screen-mirror
    string Title,
    string IconGlyph,                // Segoe MDL2 Assets 字符
    int SortOrder,
    ModuleCapability Capabilities,
    DeviceSelectionMode DeviceSelectionMode,
    bool IsPlanned = false);         // 占位模块（仅贡献导航 + "开发中"页）

/// <summary>模块能力位（Shell 据此决定可用的 UI 模式）</summary>
[Flags]
public enum ModuleCapability
{
    None = 0,
    MainView = 1,                    // 主内容区有视图
    DetachedWindow = 2,              // 可撕出独立窗口
    BackgroundRunnable = 4,          // 离开主视图仍可后台运行
    RequiresExternalTool = 8,        // 依赖外部工具链（如远期投屏）
    SingleDevicePreferred = 16,
    MultiDeviceSupported = 32,
}

/// <summary>模块宿主上下文 — ConfigureServices 时宿主提供的最小运行信息</summary>
public interface IModuleHostContext
{
    string ApplicationName { get; }
    Version ApplicationVersion { get; }

    /// <summary>应用退出信号（长任务应链入此 token 取消）</summary>
    CancellationToken ShutdownToken { get; }
}

/// <summary>可选生命周期接口 — 模块激活/失活时由 Shell 调用（导航切换）</summary>
public interface IModuleActivation
{
    Task OnActivatedAsync(CancellationToken ct);
    Task OnDeactivatedAsync(CancellationToken ct);
}
