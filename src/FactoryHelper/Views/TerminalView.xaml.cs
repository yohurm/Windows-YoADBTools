using System.Text;
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
/// 输入面板列宽动态切换（有输入 280px / 无输入 0px，日志列自动填充）。
/// 日志 UI 批量追加 + 限流，防止大输出量（logcat 等）卡死界面。
/// </summary>
public partial class TerminalView : UserControl
{
    private const double InputPanelOpenWidth = 280;
    private const double InputPanelClosedWidth = 0;

    private readonly TerminalViewModel _viewModel;
    private readonly ILogService _log;

    // 日志批量追加缓冲
    private readonly StringBuilder _logBuffer = new();
    private bool _logFlushScheduled;
    private bool _isLoaded;

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

        // 日志事件订阅（LogService 线程安全，这里切回 UI 线程批量追加）
        _log.LogAdded += OnLogAdded;
        _log.LogCleared += OnLogCleared;

        Loaded += async (_, _) =>
        {
            _isLoaded = true;
            UpdateInputColumnWidth(); // 初始状态
            FlushLogBuffer();         // 清空启动前积累的日志
            await _viewModel.InitializeAsync();
        };
        Unloaded += (_, _) =>
        {
            _isLoaded = false;
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
        // 后台线程：写入缓冲，调度一次性 UI 刷新（批量追加防卡死）
        lock (_logBuffer)
        {
            _logBuffer.Append('[').Append(entry.Timestamp.ToString("HH:mm:ss"))
                .Append("] ").Append(entry.Message).Append('\n');
        }

        if (_isLoaded && !_logFlushScheduled)
        {
            _logFlushScheduled = true;
            Dispatcher.BeginInvoke(DispatcherPriority.Background, new Action(FlushLogBuffer));
        }
    }

    private void OnLogCleared()
    {
        Dispatcher.BeginInvoke(DispatcherPriority.Background, new Action(() =>
        {
            lock (_logBuffer)
            {
                _logBuffer.Clear();
            }
            LogTextBox.Clear();
        }));
    }

    /// <summary>批量追加缓冲日志到 UI（一次性，减少 TextBox 重排）</summary>
    private void FlushLogBuffer()
    {
        _logFlushScheduled = false;

        string batch;
        lock (_logBuffer)
        {
            if (_logBuffer.Length == 0) return;
            batch = _logBuffer.ToString();
            _logBuffer.Clear();
        }

        // 日志上限保护：超过 2 万字符清空重建（TextBox 过大文本卡死）
        if (LogTextBox.Text.Length > 20_000)
            LogTextBox.Clear();

        LogTextBox.AppendText(batch);
        LogScroll.ScrollToEnd();
    }
}