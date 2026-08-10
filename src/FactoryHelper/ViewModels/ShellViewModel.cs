using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using CommunityToolkit.Mvvm.Input;
using FactoryHelper.Core;
using FactoryHelper.Services;
using Wpf.Ui.Controls;

namespace FactoryHelper.ViewModels;

/// <summary>
/// 导航模块项 — 包含模块与图标
/// </summary>
public class NavModuleItem
{
    public IModule Module { get; init; } = null!;
    public string Title => Module.Title;
    public SymbolRegular Icon { get; init; } = SymbolRegular.Box24;
}

/// <summary>
/// Shell 导航 ViewModel — 管理模块列表与激活切换
/// </summary>
public partial class ShellViewModel : INotifyPropertyChanged
{
    private readonly ModuleRegistry _registry;

    /// <summary>已注册模块（导航栏显示，含图标）</summary>
    public ObservableCollection<NavModuleItem> Modules { get; } = [];

    private IModule? _activeModule;
    public IModule? ActiveModule
    {
        get => _activeModule;
        set
        {
            if (_activeModule == value) return;
            _activeModule = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(ActiveView));
        }
    }

    /// <summary>当前激活模块的视图</summary>
    public System.Windows.Controls.UserControl? ActiveView => _activeModule?.CreateView();

    private string _adbStatus = "检查中...";
    public string AdbStatus
    {
        get => _adbStatus;
        set { _adbStatus = value; OnPropertyChanged(); }
    }

    /// <summary>模块图标映射（按注册顺序分配，新增模块在此补充）</summary>
    private static readonly SymbolRegular[] ModuleIcons =
    [
        SymbolRegular.DeveloperBoard24,   // ADB 命令终端
        SymbolRegular.ProjectionScreen24, // 投屏显示（预留）
        SymbolRegular.Folder24,           // 文件管理（预留）
        SymbolRegular.DocumentText24,     // 日志分析（预留）
        SymbolRegular.Box24               // 通用
    ];

    public ShellViewModel(ModuleRegistry registry, IAdbService adb)
    {
        _registry = registry;

        var index = 0;
        foreach (var module in _registry.Modules)
        {
            Modules.Add(new NavModuleItem
            {
                Module = module,
                Icon = ModuleIcons[Math.Min(index++, ModuleIcons.Length - 1)]
            });
        }

        AdbStatus = adb.IsAvailable() ? "已就绪" : "未找到 ADB";
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? name = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}