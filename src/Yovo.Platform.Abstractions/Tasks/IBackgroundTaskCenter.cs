namespace Yovo.Platform.Abstractions.Tasks;

/// <summary>后台任务 Id（注册时分配）</summary>
public readonly record struct BackgroundTaskId(string Value);

/// <summary>任务描述（注册时提供）</summary>
public sealed record BackgroundTaskDescriptor(string Title, string ModuleId, string? Detail = null);

/// <summary>任务运行状态</summary>
public enum BackgroundTaskState
{
    Running,
    Paused,
}

/// <summary>任务结束原因</summary>
public enum BackgroundTaskCompletion
{
    Success,
    Failed,
    Canceled,
}

/// <summary>任务快照（状态栏渲染不可变数据）</summary>
public sealed record BackgroundTaskSnapshot(
    BackgroundTaskId Id,
    string Title,
    string ModuleId,
    string? Detail,
    BackgroundTaskState State,
    double? ProgressPercent);

/// <summary>
/// 后台任务中心 — 大文件传输/持续抓 log 等离开模块 UI 仍运行的任务在此登记，
/// Shell 状态栏渲染，应用退出前遍历取消。
/// </summary>
public interface IBackgroundTaskCenter
{
    /// <summary>登记任务（返回 Id 用于 Update/Complete）</summary>
    BackgroundTaskId Register(BackgroundTaskDescriptor descriptor);

    /// <summary>更新进度/状态</summary>
    void Update(BackgroundTaskId id, BackgroundTaskState state, string? detail = null, double? progressPercent = null);

    /// <summary>任务结束（移出活跃列表）</summary>
    void Complete(BackgroundTaskId id, BackgroundTaskCompletion completion);

    /// <summary>活跃任务快照</summary>
    IReadOnlyList<BackgroundTaskSnapshot> Active { get; }

    /// <summary>任何变化（注册/更新/完成）</summary>
    event Action? Changed;
}
