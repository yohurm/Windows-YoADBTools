using System.ComponentModel;
using System.Windows;
using FactoryHelper.Modules.AdbTerminal.ViewModels;
using MessageBox = System.Windows.MessageBox;
using MessageBoxButton = System.Windows.MessageBoxButton;
using MessageBoxImage = System.Windows.MessageBoxImage;
using MessageBoxResult = System.Windows.MessageBoxResult;
using Wpf.Ui.Controls;

namespace FactoryHelper.Modules.AdbTerminal.Views;

/// <summary>
/// 命令库管理窗口 — 纯 View（DataContext = CommandManagerViewModel）。
/// code-behind 仅保留：关闭前的未保存修改确认。
/// </summary>
public partial class CommandManagerWindow : FluentWindow
{
    public CommandManagerWindow()
    {
        InitializeComponent();
    }

    private void OnWindowClosing(object? sender, CancelEventArgs e)
    {
        if (DataContext is not CommandManagerViewModel vm || vm.CanClose)
            return;

        var result = MessageBox.Show(this,
            "有未保存的修改，确定要关闭吗？\n（未保存的更改将丢失）",
            "未保存修改",
            MessageBoxButton.YesNo,
            MessageBoxImage.Warning);
        if (result != MessageBoxResult.Yes)
            e.Cancel = true;
    }
}
