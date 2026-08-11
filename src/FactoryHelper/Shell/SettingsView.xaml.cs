using System.Windows.Controls;

namespace FactoryHelper.Shell;

/// <summary>
/// 设置面板 — 右侧统一操作面板中的平台面板（非弹窗）。
/// ViewModel 注入（由 ShellViewModel 导航工厂构建），纯绑定。
/// </summary>
public partial class SettingsView : UserControl
{
    public SettingsView(SettingsViewModel viewModel)
    {
        InitializeComponent();
        DataContext = viewModel;
    }
}
