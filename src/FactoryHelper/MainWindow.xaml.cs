using System.Windows;
using System.Windows.Controls;
using FactoryHelper.Core;
using FactoryHelper.ViewModels;
using Wpf.Ui.Controls;

namespace FactoryHelper;

/// <summary>
/// Shell 主窗口 — 官方 Fluent 布局：TitleBar + NavigationView（模块导航 + 内容区）
/// </summary>
public partial class MainWindow : FluentWindow
{
    private readonly ShellViewModel _viewModel;

    public MainWindow(ShellViewModel shellViewModel)
    {
        InitializeComponent();
        _viewModel = shellViewModel;
        DataContext = shellViewModel;

        // 动态生成模块导航项（平台扩展点：新增模块自动出现，带 Fluent 图标）
        var moduleIndex = 0;
        foreach (var module in shellViewModel.Modules)
        {
            var item = new NavigationViewItem
            {
                Content = module.Title,
                Tag = module,
                NavigationCacheMode = NavigationCacheMode.Required
            };
            item.Icon = new SymbolIcon { Symbol = GetModuleSymbol(moduleIndex++) };
            RootNavigation.MenuItems.Add(item);
        }

        // 官方模式：Loaded 后触发首次导航（不直接设 SelectedItem，其 setter 受保护）
        Loaded += (_, _) =>
        {
            if (RootNavigation.MenuItems.Count > 0 && RootNavigation.MenuItems[0] is NavigationViewItem first)
                LoadModule(first);
        };
    }

    /// <summary>加载模块视图到内容区</summary>
    private void LoadModule(NavigationViewItem item)
    {
        if (item.Tag is not IModule module) return;

        RootNavigation.ReplaceContent(module.CreateView(), module);
        NavigationView.SetHeaderContent(RootNavigation,
            new BreadcrumbBarItem { Content = module.Title });
    }

    /// <summary>模块图标映射（新增模块时在此补充符号）</summary>
    private static SymbolRegular GetModuleSymbol(int index) => index switch
    {
        0 => SymbolRegular.DeveloperBoard24,      // ADB 命令终端
        1 => SymbolRegular.ProjectionScreen24,    // 投屏显示（预留）
        2 => SymbolRegular.Folder24,              // 文件管理（预留）
        3 => SymbolRegular.DocumentText24,        // 日志分析（预留）
        _ => SymbolRegular.Box24
    };

    /// <summary>导航切换：激活模块并注入内容区</summary>
    private void OnNavigationSelectionChanged(object sender, RoutedEventArgs e)
    {
        if (RootNavigation.SelectedItem is NavigationViewItem item)
            LoadModule(item);
    }
}