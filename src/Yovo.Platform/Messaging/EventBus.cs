using Yovo.Platform.Abstractions.Messaging;

namespace Yovo.Platform.Messaging;

/// <summary>
/// 进程内事件总线实现 — 发布在发布线程同步回调（顺序保证）。
/// 订阅者异常隔离：单个订阅者崩溃不影响总线与其他订阅者。
/// </summary>
public class EventBus : IEventBus
{
    private readonly object _lock = new();
    private readonly Dictionary<Type, List<Delegate>> _handlers = [];

    public void Publish<T>(T message) where T : IIntegrationEvent
    {
        Delegate[] handlers;
        lock (_lock)
        {
            if (!_handlers.TryGetValue(typeof(T), out var list))
                return;
            handlers = list.ToArray();
        }

        foreach (var handler in handlers)
        {
            try
            {
                switch (handler)
                {
                    case Action<T> sync:
                        sync(message);
                        break;
                    case Func<T, Task> async:
                        _ = async(message); // fire-and-forget：异步订阅者不阻塞发布
                        break;
                }
            }
            catch
            {
                // 订阅者异常隔离
            }
        }
    }

    public IDisposable Subscribe<T>(Action<T> handler) where T : IIntegrationEvent
        => AddHandler<T>(handler);

    public IDisposable Subscribe<T>(Func<T, Task> handler) where T : IIntegrationEvent
        => AddHandler<T>(handler);

    private IDisposable AddHandler<T>(Delegate handler) where T : IIntegrationEvent
    {
        lock (_lock)
        {
            if (!_handlers.TryGetValue(typeof(T), out var list))
            {
                list = [];
                _handlers[typeof(T)] = list;
            }
            list.Add(handler);
        }
        return new Unsubscriber(() =>
        {
            lock (_lock)
            {
                if (_handlers.TryGetValue(typeof(T), out var current))
                {
                    current.Remove(handler);
                    if (current.Count == 0)
                        _handlers.Remove(typeof(T));
                }
            }
        });
    }

    private sealed class Unsubscriber(Action action) : IDisposable
    {
        private Action? _action = action;
        public void Dispose() => Interlocked.Exchange(ref _action, null)?.Invoke();
    }
}
