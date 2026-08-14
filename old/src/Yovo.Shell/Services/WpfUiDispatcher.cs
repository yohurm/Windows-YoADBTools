using System.Windows.Threading;
using Yovo.Platform.Abstractions;

namespace Yovo.Shell.Services;

/// <summary>
/// WPF UI 线程调度实现 — 平台/模块服务通过 IUiDispatcher 编组回 UI 线程。
/// 构造于 UI 线程（组合根），捕获当前线程 Dispatcher。
/// </summary>
public sealed class WpfUiDispatcher : IUiDispatcher
{
    private readonly Dispatcher _dispatcher;

    public WpfUiDispatcher()
    {
        // 组合根在 UI 线程构造；此时 Dispatcher.CurrentDispatcher 即主线程 Dispatcher
        _dispatcher = Dispatcher.CurrentDispatcher;
    }

    public bool IsOnUiThread => _dispatcher.CheckAccess();

    public void Post(Action action)
        => _dispatcher.BeginInvoke(action);

    public Task InvokeAsync(Action action)
        => _dispatcher.InvokeAsync(action).Task;

    public Task<T> InvokeAsync<T>(Func<T> func)
        => _dispatcher.InvokeAsync(func).Task;
}
