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
/// ADB 命令终端视图 — 订阅 LogService 事件驱动刷新日志面板
/// </summary>
public partial class TerminalView : UserControl
{
    private readonly TerminalViewModel _viewModel;
    private readonly ILogService _log;

    public TerminalView(IModuleContext context)
    {
        InitializeComponent();

        _log = context.Log;
        _viewModel = new TerminalViewModel(context);

        DataContext = _viewModel;

        DeviceListBox.SelectionChanged += OnDeviceSelectionChanged;

        _viewModel.PropertyChanged += (_, e) =>
        {
            if (e.PropertyName == nameof(TerminalViewModel.IsBusy))
                BusyProgressBar.Visibility = _viewModel.IsBusy
                    ? Visibility.Visible : Visibility.Collapsed;
        };

        // 日志事件订阅（LogService 线程安全，这里切回 UI 线程）
        _log.LogAdded += OnLogAdded;
        _log.LogCleared += OnLogCleared;

        Loaded += async (_, _) => await _viewModel.InitializeAsync();
        Unloaded += (_, _) =>
        {
            _log.LogAdded -= OnLogAdded;
            _log.LogCleared -= OnLogCleared;
        };
    }

    private void OnLogAdded(LogEntry entry)
    {
        // 切回 UI 线程追加日志
        Dispatcher.BeginInvoke(DispatcherPriority.Background, new Action(() =>
        {
            var line = $"[{entry.Timestamp:HH:mm:ss}] {entry.Message}\n";
            LogTextBox.AppendText(line);
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

    private void OnDeviceSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        _viewModel.SelectedDevices.Clear();
        foreach (var item in DeviceListBox.SelectedItems)
        {
            if (item is AdbDevice device)
                _viewModel.SelectedDevices.Add(device);
        }
    }
}