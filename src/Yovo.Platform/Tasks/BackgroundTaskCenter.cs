using Yovo.Platform.Abstractions.Tasks;

namespace Yovo.Platform.Tasks;

/// <summary>
/// 后台任务中心实现 — 活跃任务字典 + 变更广播（Changed 事件 + 集成事件由订阅方转发）。
/// </summary>
public class BackgroundTaskCenter : IBackgroundTaskCenter
{
    private readonly object _lock = new();
    private readonly Dictionary<BackgroundTaskId, BackgroundTaskSnapshot> _tasks = [];
    private int _sequence;

    public event Action? Changed;

    public IReadOnlyList<BackgroundTaskSnapshot> Active
    {
        get
        {
            lock (_lock)
                return _tasks.Values.ToList();
        }
    }

    public BackgroundTaskId Register(BackgroundTaskDescriptor descriptor)
    {
        var id = new BackgroundTaskId($"task-{Interlocked.Increment(ref _sequence)}");
        lock (_lock)
        {
            _tasks[id] = new BackgroundTaskSnapshot(id, descriptor.Title, descriptor.ModuleId,
                descriptor.Detail, BackgroundTaskState.Running, null);
        }
        Changed?.Invoke();
        return id;
    }

    public void Update(BackgroundTaskId id, BackgroundTaskState state, string? detail = null, double? progressPercent = null)
    {
        lock (_lock)
        {
            if (!_tasks.TryGetValue(id, out var current))
                return;
            _tasks[id] = current with
            {
                State = state,
                Detail = detail ?? current.Detail,
                ProgressPercent = progressPercent ?? current.ProgressPercent
            };
        }
        Changed?.Invoke();
    }

    public void Complete(BackgroundTaskId id, BackgroundTaskCompletion completion)
    {
        lock (_lock)
            _tasks.Remove(id);
        Changed?.Invoke();
    }
}
