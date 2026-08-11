using System.Windows.Controls;
using FactoryHelper.Platform;

namespace FactoryHelper.Core;

/// <summary>
/// 模块上下文 — 平台向模块暴露的共享能力（仅平台级服务）。
/// 模块自身的业务服务由模块在 Initialize 中自持，不进此上下文。
/// </summary>
public interface IModuleContext
{
    /// <summary>ADB 进程调用（纯进程，不判定成败）</summary>
    IAdbProcessService Adb { get; }

    /// <summary>设备快照与选择会话（只读）</summary>
    IDeviceService Devices { get; }

    /// <summary>平台日志（按 Source 过滤订阅）</summary>
    ILogService Log { get; }

    /// <summary>配置存储（按模块 Id 命名空间分文件）</summary>
    ISettingsService Settings { get; }

    /// <summary>应用路径（数据目录/ADB 路径，可设置覆盖）</summary>
    AppPaths Paths { get; }
}

/// <summary>
/// 模块契约 — 平台只认识这个接口，模块插拔的扩展点。
/// 生命周期约定：Initialize 必须先于 CreateView（ModuleRegistry.InitializeAll 强制）。
/// </summary>
public interface IModule
{
    /// <summary>模块唯一标识（模块内常量单点定义，日志/设置命名空间同源）</summary>
    string Id { get; }

    /// <summary>导航栏显示名</summary>
    string Title { get; }

    /// <summary>导航栏图标（Segoe MDL2 Assets 字符）</summary>
    string IconGlyph { get; }

    /// <summary>导航排序（小在前，默认 0）</summary>
    int SortOrder { get; }

    /// <summary>模块初始化（注入平台服务，模块在此组装自身服务与 ViewModel）</summary>
    void Initialize(IModuleContext context);

    /// <summary>创建模块主视图（模块自持单实例，设备/命令状态不丢失）</summary>
    UserControl CreateView();
}
