using System.Windows.Controls;
using System.Windows.Input;
using Microsoft.Win32;
using Yovo.Modules.FileManager.Presentation.ViewModels;

namespace Yovo.Modules.FileManager.Presentation.Views;

/// <summary>
/// 文件管理视图 — 纯 View（DataContext = FileManagerViewModel）。
/// code-behind 仅保留 UI 服务注入：文件对话框 / 危险操作确认 / 双击导航。
/// </summary>
public partial class FileManagerView : UserControl
{
    public FileManagerView()
    {
        InitializeComponent();
        Loaded += OnLoaded;
    }

    private void OnLoaded(object sender, System.Windows.RoutedEventArgs e)
    {
        if (DataContext is not FileManagerViewModel vm)
            return;

        // View 层注入 UI 服务（VM 保持可测）
        vm.PickLocalPath = PickLocalPath;
        vm.ConfirmAction = Confirm;
        vm.PromptDirectoryName = PromptDirectoryName;
    }

    /// <summary>文件对话框：上传多选（返回 | 分隔路径）；下载单选（返回保存路径）</summary>
    private string PickLocalPath(string title, bool multiSelect)
    {
        if (multiSelect)
        {
            var open = new OpenFileDialog
            {
                Title = title,
                Multiselect = true,
                CheckFileExists = true
            };
            return open.ShowDialog() == true ? string.Join('|', open.FileNames) : string.Empty;
        }

        var save = new SaveFileDialog
        {
            Title = title,
            FileName = SelectedEntryName,
            OverwritePrompt = true
        };
        return save.ShowDialog() == true ? save.FileName : string.Empty;
    }

    private string SelectedEntryName
        => (FileList.SelectedItem as Domain.RemoteEntry)?.Name ?? string.Empty;

    /// <summary>危险操作确认（MessageBox — View 层职责）</summary>
    private bool Confirm(string message)
        => System.Windows.MessageBox.Show(
            message, "确认操作",
            System.Windows.MessageBoxButton.OKCancel,
            System.Windows.MessageBoxImage.Warning) == System.Windows.MessageBoxResult.OK;

    /// <summary>目录名输入（简单输入框 — MVP 用 TextBox 对话框简化）</summary>
    private string PromptDirectoryName()
    {
        var window = new System.Windows.Window
        {
            Title = "新建目录",
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

    /// <summary>双击：目录进入 / 文件下载（OpenEntryCommand 参数化命令）</summary>
    private void OnFileListDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (DataContext is FileManagerViewModel vm && FileList.SelectedItem is { } entry)
            _ = vm.OpenEntryCommand.ExecuteAsync(entry);
    }
}
