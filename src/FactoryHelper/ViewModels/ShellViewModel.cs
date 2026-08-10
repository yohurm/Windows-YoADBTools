using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using CommunityToolkit.Mvvm.Input;
using FactoryHelper.Core;
using FactoryHelper.Services;

namespace FactoryHelper.ViewModels;

/// <summary>
/// Shell 导航 ViewModel — 管理模块列表与激活切换
/// </summary>
public partial class ShellViewModel : INotifyPropertyChanged
{
    private readonly ModuleRegistry _registry;

    /// <summary>已注册模块（导航栏显示）</summary>
    public ObservableCollection<IModule> Modules { get; } = [];

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

    public ShellViewModel(ModuleRegistry registry, IAdbService adb)
    {
        _registry = registry;

        foreach (var module in _registry.Modules)
            Modules.Add(module);

        // 默认激活第一个模块
        if (Modules.Count > 0)
            ActiveModule = Modules[0];

        AdbStatus = adb.IsAvailable() ? "已就绪" : "未找到 ADB";
    }

    /// <summary>切换到指定模块</summary>
    [RelayCommand]
    private void ActivateModule(IModule? module)
    {
        if (module != null)
            ActiveModule = module;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? name = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}