namespace Yovo.Platform.Abstractions;

/// <summary>独立窗口选项（无 WPF 类型 — Shell 实现按此参数创建窗口）</summary>
public sealed record WindowOptions(
    string? Title = null,
    int Width = 900,
    int Height = 600,
    bool IsModal = true,
    bool CenterOwner = true);

/// <summary>
/// 窗口服务 — 模块/VM 打开独立窗口的唯一通道（VM 不 new View、不引用 Window 类型）。
/// 由 Shell 实现（Platform.Abstractions 的 UI 端口，§12.3）。
/// 防重语义：同一 viewKey 只允许一个实例；已打开则激活到前台，返回 null。
/// </summary>
public interface IWindowService
{
    /// <summary>打开分离窗口；已打开（同 viewKey）激活到前台返回 null</summary>
    bool? ShowDetached(string viewKey, object viewModel, WindowOptions? options = null);
}
