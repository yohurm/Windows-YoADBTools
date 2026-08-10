using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using CommunityToolkit.Mvvm.Input;
using FactoryHelper.Core;
using FactoryHelper.Models;
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

    /// <summary>Segoe MDL2 Assets 图标字符（可靠渲染，不依赖 WPF-UI 字体）</summary>
    public string IconChar { get; init; } = ""; // 默认: 方块
}

/// <summary>
/// Shell 导航 ViewModel — 模块列表 + 平台设备面板
/// </summary>
public partial class ShellViewModel : INotifyPropertyChanged
{
    private readonly ModuleRegistry _registry;
    private readonly IDevicePanelService _devices;

    /// <summary>已注册模块（导航栏显示，含图标）</summary>
    public ObservableCollection<NavModuleItem> Modules { get; } = [];

    /// <summary>平台设备列表（所有模块共享，UI 在 Shell 左侧）</summary>
    public ObservableCollection<AdbDevice> Devices => _devices.Devices;

    /// <summary>选中的设备</summary>
    public ObservableCollection<AdbDevice> SelectedDevices => _devices.SelectedDevices;

    private string _statusText = "就绪";
    public string StatusText
    {
        get => _statusText;
        set { _statusText = value; OnPropertyChanged(); }
    }

    private bool _isRefreshing;
    public bool IsRefreshing
    {
        get => _isRefreshing;
        set { _isRefreshing = value; OnPropertyChanged(); }
    }

    /// <summary>模块图标映射（Segoe MDL2 Assets 字符，按注册顺序分配）</summary>
    private static readonly string[] ModuleIcons =
    [
        "", // 设备/终端: 开发者
        "", // 投屏: 显示
        "", // 文件: 文件夹
        "", // 日志: 文档
        ""  // 通用: 框
    ];

    public ShellViewModel(ModuleRegistry registry, IAdbService adb, IDevicePanelService devices)
    {
        _registry = registry;
        _devices = devices;

        var index = 0;
        foreach (var module in _registry.Modules)
        {
            Modules.Add(new NavModuleItem
            {
                Module = module,
                IconChar = ModuleIcons[Math.Min(index++, ModuleIcons.Length - 1)]
            });
        }
    }

    /// <summary>刷新设备列表（Shell 启动 + 手动刷新）</summary>
    [RelayCommand]
    private async Task RefreshDevicesAsync()
    {
        if (IsRefreshing) return;

        IsRefreshing = true;
        StatusText = "正在扫描设备...";
        try
        {
            await _devices.RefreshAsync();
            StatusText = Devices.Count > 0
                ? $"已连接 {Devices.Count} 台设备"
                : "未发现设备";
        }
        catch (Exception ex)
        {
            StatusText = $"扫描失败: {ex.Message}";
        }
        finally
        {
            IsRefreshing = false;
        }
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? name = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}