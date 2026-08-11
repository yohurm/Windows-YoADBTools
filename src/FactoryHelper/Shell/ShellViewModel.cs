using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Controls;
using FactoryHelper.Core;

namespace FactoryHelper.Shell;

/// <summary>导航模块项（模块自描述，图标来自 IModule.IconGlyph）</summary>
public sealed class NavModuleItem(IModule module)
{
    public IModule Module { get; } = module;
    public string Title => Module.Title;
    public string IconGlyph => Module.IconGlyph;
}

/// <summary>
/// Shell 导航 ViewModel — 只做模块导航（列表 + 当前视图切换）。
/// 设备面板职责在 DevicePanelViewModel，不在此混入。
/// </summary>
public class ShellViewModel : INotifyPropertyChanged
{
    private IModule? _selectedModule;
    private UserControl? _currentView;

    /// <summary>导航模块列表（按 SortOrder）</summary>
    public ObservableCollection<NavModuleItem> Modules { get; } = [];

    /// <summary>设备面板（组合持有，Shell 左侧公共区）</summary>
    public DevicePanelViewModel DevicePanel { get; }

    /// <summary>当前选中模块（切换时懒创建视图，单实例复用）</summary>
    public IModule? SelectedModule
    {
        get => _selectedModule;
        set
        {
            _selectedModule = value;
            OnPropertyChanged();
            CurrentView = value?.CreateView();
        }
    }

    /// <summary>模块内容区当前视图</summary>
    public UserControl? CurrentView
    {
        get => _currentView;
        private set { _currentView = value; OnPropertyChanged(); }
    }

    public ShellViewModel(ModuleRegistry registry, DevicePanelViewModel devicePanel)
    {
        DevicePanel = devicePanel;
        foreach (var module in registry.Modules.OrderBy(m => m.SortOrder))
            Modules.Add(new NavModuleItem(module));

        SelectedModule = Modules.FirstOrDefault()?.Module;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
