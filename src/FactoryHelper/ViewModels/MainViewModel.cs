using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Input;
using CommunityToolkit.Mvvm.Input;
using FactoryHelper.Models;
using FactoryHelper.Services;

namespace FactoryHelper.ViewModels;

/// <summary>
/// 主界面 ViewModel
/// </summary>
public partial class MainViewModel : INotifyPropertyChanged
{
    private readonly AdbService _adb;
    private readonly ConfigService _config;
    private readonly IMesService _mes;

    public MainViewModel(AdbService adb, ConfigService config, IMesService mes)
    {
        _adb = adb;
        _config = config;
        _mes = mes;

        // 选中的设备集合变更时自动刷新
        SelectedDevices.CollectionChanged += (_, _) => OnCanExecuteChanged();
    }

    // ==================== 属性 ====================

    /// <summary>当前连接的设备列表</summary>
    public ObservableCollection<AdbDevice> Devices { get; } = [];

    /// <summary>用户选中的设备</summary>
    public ObservableCollection<AdbDevice> SelectedDevices { get; } = [];

    /// <summary>可用的单条命令</summary>
    public ObservableCollection<AdbCommand> Commands { get; } = [];

    /// <summary>可用的命令组</summary>
    public ObservableCollection<CommandGroup> CommandGroups { get; } = [];

    /// <summary>命令分类列表</summary>
    public ObservableCollection<string> Categories { get; } = [];

    private AdbCommand? _selectedCommand;
    public AdbCommand? SelectedCommand
    {
        get => _selectedCommand;
        set { _selectedCommand = value; OnPropertyChanged(); OnCanExecuteChanged(); }
    }

    private CommandGroup? _selectedGroup;
    public CommandGroup? SelectedGroup
    {
        get => _selectedGroup;
        set { _selectedGroup = value; OnPropertyChanged(); OnCanExecuteChanged(); }
    }

    private string _statusText = "就绪";
    public string StatusText
    {
        get => _statusText;
        set { _statusText = value; OnPropertyChanged(); }
    }

    private bool _isBusy;
    public bool IsBusy
    {
        get => _isBusy;
        set { _isBusy = value; OnPropertyChanged(); OnCanExecuteChanged(); }
    }

    /// <summary>是否可以执行命令</summary>
    public bool CanExecute =>
        !IsBusy && SelectedDevices.Count > 0 && (SelectedCommand != null || SelectedGroup != null);

    private string _logOutput = string.Empty;
    public string LogOutput
    {
        get => _logOutput;
        set { _logOutput = value; OnPropertyChanged(); }
    }

    private string _selectedCategory = "全部";
    public string SelectedCategory
    {
        get => _selectedCategory;
        set { _selectedCategory = value; OnPropertyChanged(); FilterCommands(); }
    }

    private bool _adTabCommands = true;
    public bool AdTabCommands
    {
        get => _adTabCommands;
        set { _adTabCommands = value; OnPropertyChanged(); }
    }

    // ==================== 字段 ====================

    private List<AdbCommand> _allCommands = [];

    // ==================== 初始化 ====================

    /// <summary>
    /// 初始化 — 加载配置、检查 ADB
    /// </summary>
    public async Task InitializeAsync()
    {
        StatusText = "正在初始化...";

        if (_adb.IsAvailable())
        {
            AppendLog($"[信息] ADB 路径: {_adb.AdbPath}");
        }
        else
        {
            AppendLog("[错误] ADB 工具未找到！请将 adb.exe 放入 Tools 目录或加入系统 PATH。");
            StatusText = "ADB 未就绪";
        }

        // 加载命令库（与 ADB 是否可用无关）
        var commands = await _config.LoadCommandsAsync();
        _allCommands = commands;
        RebuildCommands();

        // 加载命令组
        var groups = await _config.LoadCommandGroupsAsync();
        CommandGroups.Clear();
        foreach (var g in groups)
            CommandGroups.Add(g);

        // 提取分类
        Categories.Clear();
        Categories.Add("全部");
        foreach (var cat in commands.Select(c => c.Category).Where(c => c != null).Distinct())
            Categories.Add(cat!);

        SelectedCategory = "全部";

        // 扫描设备
        await RefreshDevicesAsync();

        StatusText = "就绪";
    }

    // ==================== 命令 ====================

    /// <summary>
    /// 刷新设备列表
    /// </summary>
    [RelayCommand]
    private async Task RefreshDevicesAsync()
    {
        if (IsBusy) return;

        IsBusy = true;
        StatusText = "正在扫描设备...";

        try
        {
            var devices = await _adb.GetDevicesAsync();
            Devices.Clear();
            SelectedDevices.Clear();

            // 并行获取每台设备的详细信息（型号、Android 版本）
            await Task.WhenAll(devices.Select(d => _adb.GetDeviceDetailAsync(d)));

            foreach (var device in devices)
                Devices.Add(device);

            AppendLog(devices.Count > 0
                ? $"[信息] 发现 {devices.Count} 台设备"
                : "[信息] 未发现已连接的设备");

            StatusText = devices.Count > 0 ? $"已连接 {devices.Count} 台设备" : "未发现设备";
        }
        catch (Exception ex)
        {
            AppendLog($"[错误] 扫描设备失败: {ex.Message}");
            StatusText = "扫描设备失败";
        }
        finally
        {
            IsBusy = false;
        }
    }

    /// <summary>
    /// 执行选中的命令（发送到所有选中设备）
    /// </summary>
    [RelayCommand(CanExecute = nameof(CanExecute))]
    private async Task ExecuteCommandAsync()
    {
        if (!CanExecute || SelectedCommand == null) return;

        IsBusy = true;
        var command = SelectedCommand;
        var devices = SelectedDevices.ToList();

        AppendLog($"=== 执行命令: {command.Name} ===");
        StatusText = $"正在执行: {command.Name}";

        try
        {
            // 并行向所有选中设备发送命令
            var tasks = devices.Select(device =>
                Task.Run(async () =>
                {
                    var result = await _adb.ExecuteCommandAsync(
                        device.SerialNumber, command.Command, command.TimeoutMs);
                    return (device, result);
                }));

            var results = await Task.WhenAll(tasks);

            foreach (var (device, result) in results)
            {
                AppendLog($"--- [{device.DisplayName}] ---");
                AppendLog($"> {command.Command}");
                if (result.Success)
                {
                    AppendLog(string.IsNullOrEmpty(result.Output)
                        ? "执行成功(无输出)"
                        : result.Output);
                }
                else
                {
                    AppendLog($"[失败] {result.Error}");
                }
                AppendLog($"耗时: {result.ElapsedMs}ms");

                // 预留：上报 MES
                await _mes.ReportResultAsync(device.SerialNumber, command.Name, result.Success);
            }
        }
        catch (Exception ex)
        {
            AppendLog($"[错误] {ex.Message}");
        }
        finally
        {
            StatusText = "就绪";
            IsBusy = false;
        }
    }

    /// <summary>
    /// 执行选中的命令组
    /// </summary>
    [RelayCommand(CanExecute = nameof(CanExecute))]
    private async Task ExecuteGroupAsync()
    {
        if (!CanExecute || SelectedGroup == null) return;

        IsBusy = true;
        var group = SelectedGroup;
        var devices = SelectedDevices.ToList();

        AppendLog($"=== 执行命令组: {group.Name} ===");
        StatusText = $"正在执行: {group.Name}";

        try
        {
            var tasks = devices.Select(device =>
                Task.Run(async () =>
                {
                    var results = await _adb.ExecuteGroupAsync(device.SerialNumber, group);
                    return (device, results);
                }));

            var allResults = await Task.WhenAll(tasks);

            foreach (var (device, results) in allResults)
            {
                AppendLog($"--- [{device.DisplayName}] ---");
                var allPassed = true;
                foreach (var r in results)
                {
                    var status = r.Success ? "OK" : "FAIL";
                    AppendLog($"[{status}] {r.Command} ({r.ElapsedMs}ms)");
                    if (!string.IsNullOrEmpty(r.Output))
                        AppendLog($"  {r.Output.Trim()}");
                    if (!string.IsNullOrEmpty(r.Error))
                        AppendLog($"  错误: {r.Error.Trim()}");
                    if (!r.Success) allPassed = false;
                }
                AppendLog(allPassed ? "结果: 全部通过" : "结果: 存在失败项");

                await _mes.ReportResultAsync(device.SerialNumber, group.Name, allPassed);
            }
        }
        catch (Exception ex)
        {
            AppendLog($"[错误] {ex.Message}");
        }
        finally
        {
            StatusText = "就绪";
            IsBusy = false;
        }
    }

    /// <summary>
    /// 清除日志
    /// </summary>
    [RelayCommand]
    private void ClearLog()
    {
        LogOutput = string.Empty;
    }

    // ==================== 内部方法 ====================

    /// <summary>
    /// 按分类重建命令列表
    /// </summary>
    private void RebuildCommands()
    {
        Commands.Clear();
        var filtered = SelectedCategory == "全部"
            ? _allCommands
            : _allCommands.Where(c => c.Category == SelectedCategory);
        foreach (var cmd in filtered)
            Commands.Add(cmd);
    }

    private void FilterCommands()
    {
        RebuildCommands();
    }

    private void AppendLog(string message)
    {
        var timestamp = DateTime.Now.ToString("HH:mm:ss");
        Application.Current.Dispatcher.Invoke(() =>
        {
            LogOutput += $"[{timestamp}] {message}\n";
        });
    }

    // ==================== INotifyPropertyChanged ====================

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? name = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }

    /// <summary>
    /// CanExecute 相关状态变化时，刷新命令可用性
    /// </summary>
    private void OnCanExecuteChanged()
    {
        OnPropertyChanged(nameof(CanExecute));
        ExecuteCommandCommand.NotifyCanExecuteChanged();
        ExecuteGroupCommand.NotifyCanExecuteChanged();
    }
}