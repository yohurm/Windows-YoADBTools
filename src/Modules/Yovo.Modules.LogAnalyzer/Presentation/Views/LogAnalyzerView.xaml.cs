using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using Yovo.Modules.LogAnalyzer.Presentation.ViewModels;

namespace Yovo.Modules.LogAnalyzer.Presentation.Views;

/// <summary>
/// 日志分析视图 — 纯 View（DataContext = LogAnalyzerViewModel）。
/// code-behind 仅保留：自动滚底（F21）+ 快捷键（F35）。
/// </summary>
public partial class LogAnalyzerView : UserControl
{
    private bool _isAutoScroll = true;

    public LogAnalyzerView()
    {
        InitializeComponent();
        Loaded += OnLoaded;
    }

    private void OnLoaded(object sender, System.Windows.RoutedEventArgs e)
    {
        // View 注入预设名输入（VM 保持可测）
        if (DataContext is LogAnalyzerViewModel vm)
            vm.PromptPresetName = PromptPresetName;
    }

    /// <summary>预设名输入框（轻量对话框，与文件管理同模式）</summary>
    private string PromptPresetName()
    {
        var window = new System.Windows.Window
        {
            Title = "保存过滤预设",
            Width = 360,
            Height = 130,
            WindowStartupLocation = System.Windows.WindowStartupLocation.CenterOwner,
            Owner = System.Windows.Application.Current.MainWindow,
            ShowInTaskbar = false,
            ResizeMode = System.Windows.ResizeMode.NoResize
        };
        var textBox = new TextBox { Margin = new System.Windows.Thickness(12, 12, 12, 8) };
        var ok = new System.Windows.Controls.Button
        {
            Content = "确定",
            IsDefault = true,
            HorizontalAlignment = System.Windows.HorizontalAlignment.Right,
            Margin = new System.Windows.Thickness(0, 0, 12, 12)
        };
        var cancel = new System.Windows.Controls.Button
        {
            Content = "取消",
            IsCancel = true,
            Margin = new System.Windows.Thickness(0, 0, 8, 12)
        };
        var buttons = new System.Windows.Controls.StackPanel
        {
            Orientation = System.Windows.Controls.Orientation.Horizontal,
            HorizontalAlignment = System.Windows.HorizontalAlignment.Right
        };
        buttons.Children.Add(cancel);
        buttons.Children.Add(ok);
        var panel = new System.Windows.Controls.DockPanel();
        DockPanel.SetDock(buttons, System.Windows.Controls.Dock.Bottom);
        panel.Children.Add(buttons);
        panel.Children.Add(textBox);
        window.Content = panel;

        string name = string.Empty;
        ok.Click += (_, _) => { name = textBox.Text; window.DialogResult = true; };
        return window.ShowDialog() == true ? name : string.Empty;
    }

    /// <summary>
    /// 快捷键（F35）：空格=暂停（采集时）、Ctrl+L=清空、Ctrl+C=复制选中（非输入框）、Ctrl+F=聚焦关键字。
    /// 输入框聚焦时不劫持空格/Ctrl+C（保留文本编辑系统行为）。
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
        else if (e.Key == Key.C && Keyboard.Modifiers == ModifierKeys.Control && !inTextBox)
        {
            vm.CopySelectedCommand.Execute(null);
            e.Handled = true;
        }
        else if (e.Key == Key.F && Keyboard.Modifiers == ModifierKeys.Control)
        {
            KeywordBox.Focus();
            e.Handled = true;
        }
    }

    private void OnLogScrollChanged(object sender, ScrollChangedEventArgs e)
    {
        // 附加事件注册在 ListView 上，实际触发者是模板内部 ScrollViewer（OriginalSource）
        if (e.OriginalSource is not ScrollViewer scrollViewer)
            return;
        var atBottom = Math.Abs(e.VerticalOffset + e.ViewportHeight - e.ExtentHeight) < 1;

        if (atBottom)
            _isAutoScroll = true;             // 用户滚回底部 → 重新跟随
        else if (e.ExtentHeightChange == 0)
            _isAutoScroll = false;            // 高度未变但位置变了 = 用户滚动 → 解锁

        if (e.ExtentHeightChange > 0 && _isAutoScroll)
            scrollViewer.ScrollToEnd();       // 新内容 + 跟随模式 → 滚到底
    }
}
