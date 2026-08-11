using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using FactoryHelper.Modules.AdbTerminal.ViewModels;

namespace FactoryHelper.Modules.AdbTerminal.Views;

/// <summary>
/// ADB 命令终端视图 — 纯 View（ViewModel 注入，不自建）。
/// code-behind 仅保留布局职责：输入面板列宽动态切换 + 日志自动滚动。
/// </summary>
public partial class TerminalView : UserControl
{
    private const double InputPanelClosedWidth = 0;

    private readonly TerminalViewModel _viewModel;

    /// <summary>输入面板展开宽度（来自全局 Token Size.InputPanel，避免双份硬编码）</summary>
    private double InputPanelOpenWidth =>
        Application.Current.TryFindResource("Size.InputPanel") is GridLength size ? size.Value : 280;

    public TerminalView(TerminalViewModel viewModel)
    {
        InitializeComponent();
        _viewModel = viewModel;
        DataContext = viewModel;

        // 布局状态管理（View 职责）：有输入展开列，无输入收起（日志列自动填充）
        _viewModel.PropertyChanged += (_, e) =>
        {
            if (e.PropertyName == nameof(TerminalViewModel.HasInputPanel))
                UpdateInputColumnWidth();
        };

        // 日志自动滚动（等布局完成后再滚到底部）
        _viewModel.LogEntries.CollectionChanged += (_, _) =>
            Dispatcher.BeginInvoke(DispatcherPriority.Background, new Action(() => LogScroll.ScrollToEnd()));

        Loaded += async (_, _) =>
        {
            UpdateInputColumnWidth();
            try
            {
                await _viewModel.InitializeAsync();
            }
            catch (Exception ex)
            {
                _viewModel.StatusText = $"初始化失败: {ex.Message}";
            }
        };
    }

    private void UpdateInputColumnWidth()
        => ColInput.Width = new GridLength(
            _viewModel.HasInputPanel ? InputPanelOpenWidth : InputPanelClosedWidth);
}
