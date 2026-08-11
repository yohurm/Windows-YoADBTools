using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Wpf.Ui;
using Wpf.Ui.Controls;
using Yovo.Modules.AdbTerminal.Presentation.ViewModels;

namespace Yovo.Modules.AdbTerminal.Presentation.Views;

/// <summary>
/// 命令库管理窗口 — 纯 View（DataContext = CommandManagerViewModel）。
/// code-behind 仅保留：关闭前的未保存修改确认（ContentDialog）。
/// 自底而上三层保护（防关闭死循环）：确认标志防重入、保存后 IsDirty=false、对话框异常隔离。
/// </summary>
public partial class CommandManagerWindow : FluentWindow
{
    // ContentDialog 宿主服务 + 关闭确认对话框（代码创建，避免与窗口内容双父冲突）
    private readonly IContentDialogService _contentDialogService = new ContentDialogService();
    private readonly ContentDialog _closeConfirmDialog = new()
    {
        Title = "未保存修改",
        Content = "有未保存的修改，确定要关闭吗？（未保存的更改将丢失）",
        PrimaryButtonText = "关闭",
        SecondaryButtonText = "取消",
        PrimaryButtonAppearance = ControlAppearance.Danger
    };

    /// <summary>用户已确认关闭（防止 Close() 重入 Closing 造成确认死循环）</summary>
    private bool _closeConfirmed;

    public CommandManagerWindow()
    {
        InitializeComponent();
        _contentDialogService.SetDialogHost(DialogHost);
    }

    private async void OnWindowClosing(object? sender, CancelEventArgs e)
    {
        if (DataContext is not CommandManagerViewModel vm)
            return;

        // 已确认关闭：放行（第二次 Closing 直接通过，不再弹窗）
        if (_closeConfirmed)
            return;

        // 强制提交全部编辑框（绑定默认 LostFocus 写回，键盘/程序化输入均可靠覆盖）
        foreach (var box in FindVisualChildren<System.Windows.Controls.TextBox>(this))
            box.GetBindingExpression(System.Windows.Controls.TextBox.TextProperty)?.UpdateSource();

        if (vm.CanClose)
            return;

        // 取消默认关闭，等待用户确认
        e.Cancel = true;
        try
        {
            var result = await _contentDialogService.ShowAsync(_closeConfirmDialog, CancellationToken.None);
            if (result == ContentDialogResult.Primary)
            {
                _closeConfirmed = true;
                Close(); // 重入 Closing：_closeConfirmed 放行
            }
        }
        catch
        {
            // 对话框异常：保持窗口打开，不崩溃（用户可再次尝试）
        }
    }

    private static IEnumerable<T> FindVisualChildren<T>(DependencyObject parent) where T : DependencyObject
    {
        for (var i = 0; i < VisualTreeHelper.GetChildrenCount(parent); i++)
        {
            var child = VisualTreeHelper.GetChild(parent, i);
            if (child is T match)
                yield return match;
            foreach (var sub in FindVisualChildren<T>(child))
                yield return sub;
        }
    }
}
