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

    /// <summary>当前选中命令的参数输入项（空表示无需输入）</summary>
    public ObservableCollection<CommandInputItem> InputItems { get; } = [];

    private AdbCommand? _selectedCommand;
    public AdbCommand? SelectedCommand
    {
        get => _selectedCommand;
        set
        {
            _selectedCommand = value;
            OnPropertyChanged();
            RebuildInputItems();
            OnCanExecuteChanged();
        }
    }

    /// <summary>是否需要显示参数输入区</summary>
    public bool HasInputPanel => InputItems.Count > 0;

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
    private List<CommandGroup> _allGroups = [];

    /// <summary>
    /// 选中命令变化时，重建参数输入项
    /// </summary>
    private void RebuildInputItems()
    {
        InputItems.Clear();
        if (_selectedCommand?.RequiresInput == true)
        {
            foreach (var prompt in _selectedCommand.InputPrompts)
                InputItems.Add(new CommandInputItem { Label = prompt });
        }
        OnPropertyChanged(nameof(HasInputPanel));
    }

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
        _allGroups = await _config.LoadCommandGroupsAsync();
        CommandGroups.Clear();
        foreach (var g in _allGroups)
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

        var command = SelectedCommand;
        var devices = SelectedDevices.ToList();

        // 需要输入参数的命令：从输入面板读取并校验
        string resolvedCommand = command.Command;
        if (command.RequiresInput)
        {
            // 校验输入项非空
            foreach (var item in InputItems)
            {
                if (string.IsNullOrWhiteSpace(item.Value))
                {
                    AppendLog($"[提示] 请填写: {item.Label}");
                    StatusText = $"请填写: {item.Label}";
                    return;
                }
            }

            // 用输入值替换 {0} {1}... 占位符
            resolvedCommand = string.Format(command.Command,
                InputItems.Select(i => (object)i.Value).ToArray());
            AppendLog($"[输入] {string.Join(" / ", InputItems.Select(i => i.Value))}");
        }

        IsBusy = true;
        AppendLog($"=== 执行命令: {command.Name} ===");
        StatusText = $"正在执行: {command.Name}";

        try
        {
            // 并行向所有选中设备发送命令
            var tasks = devices.Select(device =>
                Task.Run(async () =>
                {
                    var result = await _adb.ExecuteCommandAsync(
                        device.SerialNumber, resolvedCommand, command.TimeoutMs);
                    return (device, result);
                }));

            var results = await Task.WhenAll(tasks);

            foreach (var (device, result) in results)
            {
                AppendLog($"--- [{device.DisplayName}] ---");
                AppendLog($"> {resolvedCommand}");
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

        var group = SelectedGroup;
        var devices = SelectedDevices.ToList();

        // 1. 预收集命令组中所有需要输入的步骤参数
        var inputSteps = group.Steps
            .Select((step, idx) => (StepNo: idx + 1, step))
            .Where(x => x.step.RequiresInput)
            .ToList();

        List<string> inputValues = [];
        if (inputSteps.Count > 0)
        {
            var dialog = new Views.MultiStepInputDialog(group.Name,
                inputSteps.Select(x => (x.StepNo,
                    Desc: x.step.Description ?? x.step.Command,
                    x.step.Command,
                    x.step.InputPrompts)).ToList())
            {
                Owner = Application.Current.MainWindow
            };

            if (dialog.ShowDialog() != true)
            {
                AppendLog($"[取消] 已取消执行命令组: {group.Name}");
                return;
            }
            inputValues = dialog.Values;
        }

        // 2. 将输入值按顺序写入各步骤（占位符替换）
        var valueQueue = new Queue<string>(inputValues);
        foreach (var step in group.Steps.Where(s => s.RequiresInput))
        {
            var values = step.InputPrompts.Select(_ => valueQueue.Dequeue()).ToArray();
            step.Command = string.Format(step.Command, values.Select(v => (object)v).ToArray());
        }
        AppendLog($"[输入] {string.Join(" / ", inputValues)}");

        IsBusy = true;
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

            foreach (var (device, execResult) in allResults)
            {
                AppendLog($"--- [{device.DisplayName}] ---");
                var allPassed = true;

                for (var i = 0; i < execResult.Results.Count; i++)
                {
                    var r = execResult.Results[i];
                    var status = r.Success ? "OK" : "FAIL";
                    AppendLog($"[{status}] 步骤{i + 1}: {r.Command} ({r.ElapsedMs}ms)");
                    if (!string.IsNullOrEmpty(r.Output))
                        AppendLog($"  {r.Output.Trim()}");
                    if (!string.IsNullOrEmpty(r.Error))
                        AppendLog($"  错误: {r.Error.Trim()}");
                    if (!r.Success) allPassed = false;
                }

                if (execResult.Aborted)
                {
                    AppendLog($"结果: 在第 {execResult.AbortedStepIndex} 步失败，已中断");
                }
                else
                {
                    AppendLog(allPassed ? "结果: 全部通过" : "结果: 存在失败项");
                }

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

    /// <summary>
    /// 打开命令库管理窗口
    /// </summary>
    [RelayCommand]
    private void OpenCommandManager()
    {
        var window = new Views.CommandManagerWindow(_allCommands, _allGroups)
        {
            Owner = Application.Current.MainWindow
        };
        window.ShowDialog();

        // 保存后刷新命令列表、分类和命令组
        if (window.SavedCommands.Count > 0)
        {
            _allCommands = window.SavedCommands;
            RebuildCommands();
            RefreshCategories();
        }

        if (window.SavedGroups.Count > 0)
        {
            _allGroups = window.SavedGroups;
            CommandGroups.Clear();
            foreach (var g in _allGroups)
                CommandGroups.Add(g);
        }
    }

    /// <summary>
    /// 重建分类列表
    /// </summary>
    private void RefreshCategories()
    {
        var current = SelectedCategory;
        Categories.Clear();
        Categories.Add("全部");
        foreach (var cat in _allCommands.Select(c => c.Category).Where(c => c != null).Distinct())
            Categories.Add(cat!);

        SelectedCategory = Categories.Contains(current) ? current : "全部";
        RebuildCommands();
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