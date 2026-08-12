using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using Yovo.Modules.LogAnalyzer.Application;
using Yovo.Modules.LogAnalyzer.Presentation.ViewModels;

namespace Yovo.Modules.LogAnalyzer.Presentation.Views;

/// <summary>
/// 日志分析视图 — 纯 View（DataContext = LogAnalyzerViewModel）。
/// code-behind 仅保留 UI 服务注入：新建会话对话框（包名/PID）、重命名输入、快捷键（F35 + M1）。
/// </summary>
public partial class LogAnalyzerView : UserControl
{
    public LogAnalyzerView()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        // View 注入输入回调（VM 保持可测）
        if (DataContext is LogAnalyzerViewModel vm)
        {
            vm.PromptSessionTitle = PromptSessionTitle;
            vm.PromptPackageName = PromptPackage;
            vm.PromptPidName = PromptPid;
        }
        // 快捷键挂到主窗口 PreviewKeyDown：WPF KeyDown 从焦点元素路由，
        // 无焦点时模块视图收不到 → 窗口级 Preview（隧道自根发起，聚焦无关）
        if (System.Windows.Application.Current.MainWindow is { } window)
            window.PreviewKeyDown += OnWindowPreviewKeyDown;
    }

    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        if (System.Windows.Application.Current.MainWindow is { } window)
            window.PreviewKeyDown -= OnWindowPreviewKeyDown;
    }

    /// <summary>
    /// 窗口级快捷键（聚焦无关；e.Handled 置位后网格 KeyDown 不再重复触发）。
    /// 转发给网格处理逻辑（快捷键语义集中一处）。
    /// </summary>
    private void OnWindowPreviewKeyDown(object sender, KeyEventArgs e)
        => OnKeyDown(sender, e);

    // ==================== 新建会话（[+]，M1 F40/F41/F42） ====================

    private void OnNewSessionClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button && button.ContextMenu is { } menu)
        {
            menu.PlacementTarget = button;
            menu.Placement = PlacementMode.Bottom;
            menu.IsOpen = true;
            menu.Focus(); // 程序化打开的菜单默认无输入焦点 → 聚焦后可响应鼠标/键盘
            e.Handled = true;
        }
    }

    // ==================== 输入对话框（轻量 Window，与文件管理同模式） ====================

    /// <summary>重命名会话标题输入（View 注入）</summary>
    private string PromptSessionTitle(LogSession session)
    {
        var box = new TextBox { Text = session.Title, Margin = new Thickness(12, 12, 12, 8) };
        string result = string.Empty;
        var window = PromptWindow("重命名会话", box, text =>
        {
            result = text.Trim();
            return result.Length > 0;
        });
        window.ShowDialog();
        return result;
    }

    /// <summary>按包名开窗：可搜索下拉选进程</summary>
    private string PromptPackage()
    {
        var vm = (LogAnalyzerViewModel)DataContext;
        var combo = new ComboBox
        {
            ItemsSource = vm.ProcessEntries,
            DisplayMemberPath = nameof(ProcessEntry.ProcessName),
            IsEditable = true,
            IsTextSearchEnabled = true,
            Margin = new Thickness(12, 12, 12, 8)
        };
        TextSearch.SetTextPath(combo, nameof(ProcessEntry.ProcessName));

        string result = string.Empty;
        var window = PromptWindow("按包名新建会话", combo, text =>
        {
            result = combo.SelectedItem is ProcessEntry entry ? entry.ProcessName : text;
            return !string.IsNullOrWhiteSpace(result);
        });
        window.ShowDialog();
        return result;
    }

    /// <summary>按 PID 开窗：数字输入</summary>
    private string PromptPid()
    {
        var box = new TextBox { Margin = new Thickness(12, 12, 12, 8) };
        string result = string.Empty;
        var window = PromptWindow("按 PID 新建会话", box, text =>
        {
            result = text.Trim();
            return result.All(char.IsAsciiDigit) && result.Length > 0;
        });
        window.ShowDialog();
        return result;
    }

    private static Window PromptWindow(string title, Control input, Func<string, bool> validate)
    {
        var window = new Window
        {
            Title = title,
            Width = 400,
            Height = 150,
            WindowStartupLocation = WindowStartupLocation.CenterOwner,
            Owner = System.Windows.Application.Current.MainWindow,
            ShowInTaskbar = false,
            ResizeMode = ResizeMode.NoResize
        };
        var ok = new Button
        {
            Content = "确定",
            IsDefault = true,
            HorizontalAlignment = HorizontalAlignment.Right,
            Margin = new Thickness(0, 0, 12, 12)
        };
        var cancel = new Button
        {
            Content = "取消",
            IsCancel = true,
            Margin = new Thickness(0, 0, 8, 12)
        };
        var buttons = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Right
        };
        buttons.Children.Add(cancel);
        buttons.Children.Add(ok);
        var panel = new DockPanel();
        DockPanel.SetDock(buttons, Dock.Bottom);
        panel.Children.Add(buttons);
        panel.Children.Add(input);
        window.Content = panel;

        ok.Click += (_, _) =>
        {
            if (validate(input is TextBox tb ? tb.Text : (input as ComboBox)?.Text ?? string.Empty))
                window.DialogResult = true;
        };
        return window;
    }

    private static void ShowInfo(string title, string message)
        => MessageBox.Show(message, title, MessageBoxButton.OK, MessageBoxImage.Information);

    // ==================== 快捷键（F35 + M1：Ctrl+T/W/Tab 会话操作） ====================

    /// <summary>
    /// 空格=暂停焦点会话（采集中）、Ctrl+L=清空焦点会话、Ctrl+F=聚焦焦点会话检索框、
    /// Ctrl+T=新建全部日志、Ctrl+W=关闭焦点会话、Ctrl+Tab/Shift=切换会话。
    /// 输入框聚焦时不劫持（保留文本编辑系统行为）。
    /// </summary>
    private void OnKeyDown(object sender, KeyEventArgs e)
    {
        if (DataContext is not LogAnalyzerViewModel vm)
            return;
        var inTextBox = e.OriginalSource is TextBoxBase;

        if (e.Key == Key.Space && !inTextBox)
        {
            if (vm.CanPause)
            {
                vm.PauseCommand.Execute(null);
                e.Handled = true;
            }
        }
        else if (e.Key == Key.L && Keyboard.Modifiers == ModifierKeys.Control)
        {
            vm.ClearCommand.Execute(null);
            e.Handled = true;
        }
        else if (e.Key == Key.T && Keyboard.Modifiers == ModifierKeys.Control && !inTextBox)
        {
            vm.AddAllSessionCommand.Execute(null);
            e.Handled = true;
        }
        else if (e.Key == Key.W && Keyboard.Modifiers == ModifierKeys.Control && !inTextBox)
        {
            if (vm.ActiveSession is { } active)
                vm.CloseSessionCommand.Execute(active.Session.Id);
            e.Handled = true;
        }
        else if (e.Key == Key.Tab && Keyboard.Modifiers == ModifierKeys.Control)
        {
            var shift = Keyboard.Modifiers.HasFlag(ModifierKeys.Shift);
            SwitchSession(shift ? -1 : 1);
            e.Handled = true;
        }
        else if (e.Key == Key.F && Keyboard.Modifiers == ModifierKeys.Control)
        {
            if (SessionTabs.SelectedContent is LogSessionPane pane)
                pane.FocusKeyword();
            e.Handled = true;
        }
        else if (e.Key == Key.P && Keyboard.Modifiers == (ModifierKeys.Control | ModifierKeys.Shift))
        {
            vm.AddPackageSessionInteractiveCommand.Execute(null); // 按包名开窗
            e.Handled = true;
        }
        else if (e.Key == Key.D && Keyboard.Modifiers == (ModifierKeys.Control | ModifierKeys.Shift))
        {
            vm.AddPidSessionInteractiveCommand.Execute(null); // 按 PID 开窗
            e.Handled = true;
        }
    }

    /// <summary>Ctrl+Tab / Ctrl+Shift+Tab 切换会话（WPF TabControl 默认不处理）</summary>
    private void SwitchSession(int direction)
    {
        if (DataContext is not LogAnalyzerViewModel vm || vm.SessionViewModels.Count < 2)
            return;
        var current = vm.ActiveSession;
        var index = current is null
            ? 0
            : vm.SessionViewModels.IndexOf(current);
        if (index < 0)
            index = 0;
        var next = vm.SessionViewModels[(index + direction + vm.SessionViewModels.Count) % vm.SessionViewModels.Count];
        vm.ActiveSession = next;
    }
}
