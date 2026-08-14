using System.Windows;
using Wpf.Ui.Controls;
using Yovo.Shell.Services;
using Yovo.Shell.ViewModels;

namespace Yovo.Shell.Views;

/// <summary>
/// 主窗口 — 纯 View（DataContext = ShellViewModel）。
/// code-behind 仅保留视图组合职责：导航切换 → ViewLocator 渲染内容宿主。
/// </summary>
public partial class MainWindow : FluentWindow
{
    public MainWindow(ShellViewModel shell, ViewLocator locator)
    {
        InitializeComponent();
        DataContext = shell;

        // 导航切换（后台线程不可达 — 导航仅在 UI 线程触发）
        shell.NavigationChanged += item =>
            ContentHost.Content = locator.Resolve(item.ViewKey, item.ViewModel);

        // 初始渲染（默认选中项已在 ShellViewModel 构造中确定）
        if (shell.SelectedItem is { } initial)
            ContentHost.Content = locator.Resolve(initial.ViewKey, initial.ViewModel);
    }
}
