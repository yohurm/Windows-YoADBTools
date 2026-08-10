using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using FactoryHelper.Core;
using FactoryHelper.Models;
using FactoryHelper.Services;
using FactoryHelper.ViewModels;

namespace FactoryHelper.Views;

/// <summary>
/// ADB 命令终端视图 — 订阅 LogService 事件驱动刷新日志面板；
/// 输入面板列宽动态切换（有输入 280px / 无输入 0px，日志列自动填充）
/// </summary>
public partial class TerminalView : UserControl
{
    private const double InputPanelOpenWidth = 280;
    private const double InputPanelClosedWidth = 0;

    private readonly TerminalViewModel _viewModel;
    private readonly ILogService _log;

    public TerminalView(IModuleContext context)
    {
        InitializeComponent();

        _log = context.Log;
        _viewModel = new TerminalViewModel(context);

        DataContext = _viewModel;

        _viewModel.PropertyChanged += (_, e) =>
        {
            if (e.PropertyName == nameof(TerminalViewModel.IsBusy))
                BusyProgressBar.Visibility = _viewModel.IsBusy
                    ? Visibility.Visible : Visibility.Collapsed;

            // 输入面板列宽切换：有输入展开，无输入收起（日志列自动填充）
            if (e.PropertyName == nameof(TerminalViewModel.HasInputPanel))
                UpdateInputColumnWidth();
        };

        // 日志事件订阅（LogService 线程安全，这里切回 UI 线程）
        _log.LogAdded += OnLogAdded;
        _log.LogCleared += OnLogCleared;

        Loaded += async (_, _) =>
        {
            UpdateInputColumnWidth(); // 初始状态
            await _viewModel.InitializeAsync();
        };
        Unloaded += (_, _) =>
        {
            _log.LogAdded -= OnLogAdded;
            _log.LogCleared -= OnLogCleared;
        };
    }

    /// <summary>
    /// 布局状态管理（View 职责）：
    /// 输入面板列宽 = HasInputPanel ? 280 : 0，日志列 Star 自动填充
    /// </summary>
    private void UpdateInputColumnWidth()
    {
        ColInput.Width = new GridLength(
            _viewModel.HasInputPanel ? InputPanelOpenWidth : InputPanelClosedWidth);
    }

    private void OnLogAdded(LogEntry entry)
    {
        Dispatcher.BeginInvoke(DispatcherPriority.Background, new Action(() =>
        {
            LogTextBox.AppendText($"[{entry.Timestamp:HH:mm:ss}] {entry.Message}\n");
            LogScroll.ScrollToEnd();
        }));
    }

    private void OnLogCleared()
    {
        Dispatcher.BeginInvoke(DispatcherPriority.Background, new Action(() =>
        {
            LogTextBox.Clear();
        }));
    }

}