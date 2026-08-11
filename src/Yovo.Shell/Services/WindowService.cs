using System.Windows;
using Wpf.Ui.Controls;
using Yovo.Platform.Abstractions;
using Yovo.Shell.Services;

namespace Yovo.Shell.Services;

/// <summary>
/// 窗口服务实现 — VM 打开独立窗口的唯一通道（防重：同 viewKey 只允许一个实例）。
/// 视图注册可以是 Window（如命令管理窗，自持标题栏/关闭确认）或 UserControl（通用容器包装）。
/// 模态 ShowDialog；窗口关闭后自动移除登记（可再次打开）。
/// </summary>
public sealed class WindowService(ViewLocator locator) : IWindowService
{
    private readonly Dictionary<string, Window> _openWindows = [];

    public bool? ShowDetached(string viewKey, object viewModel, WindowOptions? options = null)
    {
        // 防重：已打开则激活到前台，不新建
        if (_openWindows.TryGetValue(viewKey, out var existing) && existing.IsVisible)
        {
            existing.Activate();
            return null;
        }

        var view = locator.Resolve(viewKey, viewModel);
        var window = view as Window ?? CreateContainerWindow(viewKey, view, options);
        ConfigureWindow(window, viewKey, options);

        _openWindows[viewKey] = window;
        window.Closed += (_, _) => _openWindows.Remove(viewKey);

        if (options is { IsModal: true })
            return window.ShowDialog();
        window.Show();
        return null;
    }

    /// <summary>UserControl 视图 → FluentWindow 容器</summary>
    private static Window CreateContainerWindow(string viewKey, FrameworkElement view, WindowOptions? options)
        => new FluentWindow
        {
            Width = options?.Width ?? 900,
            Height = options?.Height ?? 600,
            ExtendsContentIntoTitleBar = true,
            WindowBackdropType = WindowBackdropType.Mica,
            Content = view
        };

    private static void ConfigureWindow(Window window, string viewKey, WindowOptions? options)
    {
        if (options?.Title is { } title)
            window.Title = title;

        window.WindowStartupLocation =
            options is { CenterOwner: true } && Application.Current.MainWindow is { } owner
                ? WindowStartupLocation.CenterOwner
                : WindowStartupLocation.CenterScreen;

        if (options is { IsModal: true })
            window.Owner = Application.Current.MainWindow;
    }
}
