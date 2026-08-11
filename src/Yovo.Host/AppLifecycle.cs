using Yovo.Platform.Abstractions;
using Yovo.Platform.Abstractions.Composition;

namespace Yovo.Host;

/// <summary>
/// 应用生命周期实现 — 组合根创建 CTS；退出时请求取消（长任务统一停止）。
/// </summary>
internal sealed class AppLifecycle(CancellationToken shutdownToken) : IAppLifecycle
{
    public CancellationToken ShutdownToken { get; } = shutdownToken;
}

/// <summary>模块宿主上下文实现 — 应用名/版本/退出信号</summary>
internal sealed class ModuleHostContext(
    string applicationName, Version applicationVersion, CancellationToken shutdownToken)
    : IModuleHostContext
{
    public string ApplicationName { get; } = applicationName;
    public Version ApplicationVersion { get; } = applicationVersion;
    public CancellationToken ShutdownToken { get; } = shutdownToken;
}
