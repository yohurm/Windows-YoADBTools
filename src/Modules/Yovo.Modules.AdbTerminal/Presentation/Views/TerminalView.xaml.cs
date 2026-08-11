using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using Yovo.Modules.AdbTerminal.Presentation.ViewModels;

namespace Yovo.Modules.AdbTerminal.Presentation.Views;

/// <summary>
/// ADB 命令终端视图 — 纯 View（DataContext = TerminalViewModel，由 ViewLocator 注入）。
/// code-behind 仅保留布局职责：输入面板列宽动态切换 + 日志自动滚动。
/// </summary>
public partial class TerminalView : UserControl
{
    private const double InputPanelClosedWidth = 0;

    public TerminalView()
    {
        InitializeComponent();
        Loaded += OnLoaded;
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        if (DataContext is not TerminalViewModel vm)
            return;

        // 布局状态管理（View 职责）：有输入展开列，无输入收起（日志列自动填充）
        vm.PropertyChanged += (_, args) =>
        {
            if (args.PropertyName == nameof(TerminalViewModel.HasInputPanel))
                UpdateInputColumnWidth(vm);
        };

        // 日志自动滚动（等布局完成后再滚到底部）
        vm.LogEntries.CollectionChanged += (_, _) =>
            Dispatcher.BeginInvoke(DispatcherPriority.Background, new Action(() => LogScroll.ScrollToEnd()));

        UpdateInputColumnWidth(vm);
        _ = vm.InitializeAsync();
    }

    /// <summary>输入面板展开宽度（来自全局 Token Size.InputPanel，避免双份硬编码）
    /// 注意：模块内存在命名空间 ...Application，类型需完全限定</summary>
    private static double InputPanelOpenWidth =>
        System.Windows.Application.Current.TryFindResource("Size.InputPanel") is GridLength size ? size.Value : 280;

    private void UpdateInputColumnWidth(TerminalViewModel vm)
        => ColInput.Width = new GridLength(vm.HasInputPanel ? InputPanelOpenWidth : InputPanelClosedWidth);
}
