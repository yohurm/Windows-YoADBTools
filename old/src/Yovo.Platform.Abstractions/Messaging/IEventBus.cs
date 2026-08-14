namespace Yovo.Platform.Abstractions.Messaging;

/// <summary>集成事件标记（进程内；模块间通信走总线，禁止静态事件/共享单例）</summary>
public interface IIntegrationEvent { }

/// <summary>
/// 进程内事件总线 — 发布在发布线程同步回调（顺序保证）；
/// Shell/ViewModel 侧用 IUiDispatcher 编组回 UI 线程。
/// </summary>
public interface IEventBus
{
    void Publish<T>(T message) where T : IIntegrationEvent;

    /// <summary>同步订阅；返回 IDisposable 退订</summary>
    IDisposable Subscribe<T>(Action<T> handler) where T : IIntegrationEvent;

    /// <summary>异步订阅（handler 异常由调用方兜底）</summary>
    IDisposable Subscribe<T>(Func<T, Task> handler) where T : IIntegrationEvent;
}
