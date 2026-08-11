using System.Windows;
using FactoryHelper.Modules.AdbTerminal.ViewModels;

namespace FactoryHelper.Modules.AdbTerminal.Views;

/// <summary>窗口服务实现（View 层）— VM 通过接口打开对话框，不依赖具体窗口类型</summary>
public class WindowService : IWindowService
{
    private CommandManagerWindow? _openManager;

    public bool? ShowCommandManager(CommandManagerViewModel viewModel)
    {
        // 防重：同一时间只允许一个命令管理窗口；已打开则激活到前台，不新建
        if (_openManager is { IsVisible: true })
        {
            _openManager.Activate();
            return null;
        }

        _openManager = new CommandManagerWindow
        {
            DataContext = viewModel,
            Owner = Application.Current.MainWindow
        };
        _openManager.Closed += (_, _) => _openManager = null;
        return _openManager.ShowDialog();
    }
}
