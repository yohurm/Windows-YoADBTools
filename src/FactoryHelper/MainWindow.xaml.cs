using System.Windows;
using System.Windows.Controls;
using FactoryHelper.Models;
using FactoryHelper.Services;
using FactoryHelper.ViewModels;
using Wpf.Ui.Controls;

namespace FactoryHelper;

/// <summary>
/// Shell 主窗口 — 左侧平台公共区（设备面板 + 模块导航）+ 模块内容区
/// </summary>
public partial class MainWindow : FluentWindow
{
    private readonly ShellViewModel _viewModel;
    private readonly IDevicePanelService _devices;

    public MainWindow(ShellViewModel shellViewModel, IDevicePanelService devices)
    {
        InitializeComponent();
        _viewModel = shellViewModel;
        _devices = devices;
        DataContext = shellViewModel;

        ModuleNavList.ItemsSource = shellViewModel.Modules;

        // 默认选中第一个模块
        if (shellViewModel.Modules.Count > 0)
            ModuleNavList.SelectedIndex = 0;

        TxtAdbStatus.Foreground = new System.Windows.Media.SolidColorBrush(
            System.Windows.Media.Color.FromRgb(0x2e, 0x7d, 0x32));

        // 启动时刷新设备
        Loaded += async (_, _) => await shellViewModel.RefreshDevicesCommand.ExecuteAsync(null);
    }

    /// <summary>模块切换：加载模块视图</summary>
    private void OnModuleSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (ModuleNavList.SelectedItem is NavModuleItem item)
            ModuleHost.Content = item.Module.CreateView();
    }

    /// <summary>设备多选同步到平台服务</summary>
    private void OnDeviceSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        _devices.SyncSelection(DeviceListBox.SelectedItems.Cast<AdbDevice>());
    }
}