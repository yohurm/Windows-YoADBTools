using System.Windows;
using System.Windows.Controls;
using FactoryHelper.Core;
using FactoryHelper.ViewModels;
using Wpf.Ui.Controls;

namespace FactoryHelper;

/// <summary>
/// Shell 主窗口 — 固定侧边导航 + 模块内容区
/// </summary>
public partial class MainWindow : FluentWindow
{
    public MainWindow(ShellViewModel shellViewModel)
    {
        InitializeComponent();
        DataContext = shellViewModel;

        ModuleNavList.ItemsSource = shellViewModel.Modules;

        // 默认选中第一个模块
        if (shellViewModel.Modules.Count > 0)
            ModuleNavList.SelectedIndex = 0;

        TxtAdbStatus.Foreground = new System.Windows.Media.SolidColorBrush(
            shellViewModel.AdbStatus == "已就绪"
                ? System.Windows.Media.Color.FromRgb(0x2e, 0x7d, 0x32)  // 绿色
                : System.Windows.Media.Color.FromRgb(0xc6, 0x28, 0x28)); // 红色
    }

    /// <summary>模块切换：加载模块视图</summary>
    private void OnModuleSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (ModuleNavList.SelectedItem is NavModuleItem item)
            ModuleHost.Content = item.Module.CreateView();
    }
}