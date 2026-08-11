using System.Windows;
using FactoryHelper.Modules.AdbTerminal.ViewModels;

namespace FactoryHelper.Modules.AdbTerminal.Views;

/// <summary>窗口服务实现（View 层）— VM 通过接口打开对话框，不依赖具体窗口类型</summary>
public class WindowService : IWindowService
{
    public bool? ShowCommandManager(CommandManagerViewModel viewModel)
    {
        var window = new CommandManagerWindow
        {
            DataContext = viewModel,
            Owner = Application.Current.MainWindow
        };
        return window.ShowDialog();
    }

    public string? PickTag(IReadOnlyList<string> tags, string? current)
    {
        var dialog = new TagPickerDialog(tags.ToList(), current)
        {
            Owner = Application.Current.MainWindow
        };
        return dialog.ShowDialog() == true ? dialog.SelectedTag : null;
    }
}
