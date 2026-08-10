using System.Windows;
using System.Windows.Controls;
using FactoryHelper.Core;
using FactoryHelper.ViewModels;
using Wpf.Ui.Controls;

namespace FactoryHelper;

/// <summary>
/// Shell 主窗口 — Fluent 侧边导航 + 模块内容区
/// </summary>
public partial class MainWindow : FluentWindow
{
    private readonly ShellViewModel _viewModel;

    public MainWindow(ShellViewModel shellViewModel)
    {
        InitializeComponent();
        _viewModel = shellViewModel;
        DataContext = shellViewModel;

        ModuleNavList.ItemsSource = shellViewModel.Modules;

        // 默认选中第一个模块
        if (shellViewModel.Modules.Count > 0)
            ModuleNavList.SelectedIndex = 0;

        TxtAdbStatus.Foreground = new System.Windows.Media.SolidColorBrush(
            shellViewModel.AdbStatus == "已就绪"
                ? System.Windows.Media.Colors.LightGreen
                : System.Windows.Media.Colors.OrangeRed);
    }

    /// <summary>模块切换：加载模块视图</summary>
    private void OnModuleSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (ModuleNavList.SelectedItem is IModule module)
            ModuleHost.Content = module.CreateView();
    }
}