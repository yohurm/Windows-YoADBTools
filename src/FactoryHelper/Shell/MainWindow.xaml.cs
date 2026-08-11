using Wpf.Ui.Controls;

namespace FactoryHelper.Shell;

/// <summary>
/// Shell 主窗口 — 纯壳。
/// 导航/设备同步/状态全部走绑定（SelectedItems 由附加行为接管），code-behind 无业务逻辑。
/// </summary>
public partial class MainWindow : FluentWindow
{
    public MainWindow(ShellViewModel viewModel)
    {
        InitializeComponent();
        DataContext = viewModel;
    }
}
