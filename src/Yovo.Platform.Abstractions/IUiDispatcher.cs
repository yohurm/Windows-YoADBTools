namespace Yovo.Platform.Abstractions;

/// <summary>
/// UI 线程调度抽象 — 平台/模块服务不引用 WPF Dispatcher；UI 编组统一走此端口。
/// Host 注册实现（WPF Dispatcher 包装）。事件在后台线程回调时，UI 侧必须经此编组。
/// </summary>
public interface IUiDispatcher
{
    bool IsOnUiThread { get; }

    /// <summary>异步投递（不等待）</summary>
    void Post(Action action);

    /// <summary>等待执行完成</summary>
    Task InvokeAsync(Action action);

    /// <summary>等待执行完成并取回结果</summary>
    Task<T> InvokeAsync<T>(Func<T> func);
}
