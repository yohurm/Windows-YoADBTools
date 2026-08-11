namespace Yovo.Platform.Abstractions;

/// <summary>
/// 应用生命周期 — 组合根提供；长任务/模块应链入 ShutdownToken 以便退出时统一取消。
/// </summary>
public interface IAppLifecycle
{
    /// <summary>应用退出信号（窗口关闭 → 请求取消 → 模块 DisposeAsync）</summary>
    CancellationToken ShutdownToken { get; }
}
