using System.Windows;
using FactoryHelper.ViewModels;

namespace FactoryHelper;

/// <summary>
/// Shell 主窗口 — 模块导航 + 内容区
/// </summary>
public partial class MainWindow : Window
{
    public MainWindow(ShellViewModel shellViewModel)
    {
        InitializeComponent();
        DataContext = shellViewModel;
        TxtAdbStatus.Foreground = new System.Windows.Media.SolidColorBrush(
            shellViewModel.AdbStatus == "已就绪"
                ? System.Windows.Media.Colors.LightGreen
                : System.Windows.Media.Colors.OrangeRed);
    }
}