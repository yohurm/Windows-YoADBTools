using System.Windows.Controls;
using FactoryHelper.Services;

namespace FactoryHelper.Core;

/// <summary>
/// 模块上下文 — 平台向模块暴露的共享能力。
/// 所有模块（终端/投屏/文件管理）通过它访问平台服务。
/// </summary>
public interface IModuleContext
{
    /// <summary>共享 ADB 设备连接服务</summary>
    IAdbService Adb { get; }

    /// <summary>共享日志服务</summary>
    ILogService Log { get; }

    /// <summary>配置存储（按模块 Id 命名空间）</summary>
    ISettingsService Settings { get; }

    /// <summary>命令仓库（单一数据源）</summary>
    ICommandLibraryService CommandLibrary { get; }

    /// <summary>执行引擎</summary>
    IExecutionService Execution { get; }

    /// <summary>平台设备面板（设备列表/选择状态，所有模块共享）</summary>
    IDevicePanelService Devices { get; }
}

/// <summary>
/// 模块契约 — 平台只认识这个接口，模块插拔的扩展点。
/// 新增模块: 实现 IModule + 注册到 ModuleRegistry，Shell 导航自动出现。
/// </summary>
public interface IModule
{
    /// <summary>模块唯一标识（如 "adb-terminal"）</summary>
    string Id { get; }

    /// <summary>导航栏显示名（如 "ADB 命令终端"）</summary>
    string Title { get; }

    /// <summary>模块初始化（注入平台服务）</summary>
    void Initialize(IModuleContext context);

    /// <summary>创建模块主视图</summary>
    UserControl CreateView();
}