using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows;
using CommunityToolkit.Mvvm.Input;
using FactoryHelper.Core;
using FactoryHelper.Models;
using FactoryHelper.Services;

namespace FactoryHelper.ViewModels;

/// <summary>
/// ADB 命令终端 ViewModel — 设备管理、命令/命令组浏览、执行、统一输入区
/// </summary>
public partial class TerminalViewModel : INotifyPropertyChanged
{
    private readonly IDevicePanelService _devices;
    private readonly ICommandLibraryService _library;
    private readonly IExecutionService _execution;
    private readonly ILogService _log;
    private readonly string _moduleId;

    public TerminalViewModel(IModuleContext context)
    {
        _devices = context.Devices;
        _log = context.Log;
        _library = context.CommandLibrary;
        _execution = context.Execution;
        _moduleId = "adb-terminal";

        // 设备选择变化时刷新命令可用性（平台共享，Shell 面板驱动）
        _devices.SelectionChanged += OnCanExecuteChanged;

        // 命令库变更时自动刷新（单一数据源，界面订阅）
        _library.LibraryChanged += OnLibraryChanged;
    }

    // ==================== 属性 ====================

    /// <summary>平台设备面板（Shell 左侧公共区，共享）</summary>
    public ObservableCollection<AdbDevice> Devices => _devices.Devices;
    public ObservableCollection<AdbDevice> SelectedDevices => _devices.SelectedDevices;
    public ObservableCollection<CommandDefinition> Commands { get; } = [];
    public ObservableCollection<CommandGroup> CommandGroups { get; } = [];
    public ObservableCollection<string> Categories { get; } = [];
    public ObservableCollection<string> GroupCategories { get; } = [];

    /// <summary>统一参数输入区 — 选中单条命令或命令组时按需生成</summary>
    public ObservableCollection<InputField> ActiveInputs { get; } = [];

    public bool HasInputPanel => ActiveInputs.Count > 0;

    private CommandDefinition? _selectedCommand;
    public CommandDefinition? SelectedCommand
    {
        get => _selectedCommand;
        set
        {
            _selectedCommand = value;
            OnPropertyChanged();
            RebuildActiveInputs();
            OnCanExecuteChanged();
        }
    }

    private CommandGroup? _selectedGroup;
    public CommandGroup? SelectedGroup
    {
        get => _selectedGroup;
        set
        {
            _selectedGroup = value;
            OnPropertyChanged();
            RebuildActiveInputs();
            OnCanExecuteChanged();
        }
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
        set { _selectedCategory = value; OnPropertyChanged(); RebuildCommands(); }
    }

    private string _selectedGroupCategory = "全部";
    public string SelectedGroupCategory
    {
        get => _selectedGroupCategory;
        set { _selectedGroupCategory = value; OnPropertyChanged(); RebuildGroups(); }
    }

    // ==================== 生命周期 ====================

    /// <summary>视图加载完成后初始化</summary>
    public async Task InitializeAsync()
    {
        StatusText = "正在初始化...";
        _log.Info("ADB 命令终端模块初始化", _moduleId);

        await _library.InitializeAsync(); // 触发 LibraryChanged → 刷新命令/分组
        _log.Info($"命令库加载完成: {_library.Commands.Count} 条命令, {_library.Groups.Count} 个命令组", _moduleId);
        StatusText = "就绪";
    }

    // ==================== 命令库事件 ====================

    private void OnLibraryChanged()
    {
        RebuildCommands();
        RefreshCategories();
        RebuildGroups();
        RefreshGroupCategories();
    }

    // ==================== 设备 ====================

    // ==================== 执行 ====================

    [RelayCommand(CanExecute = nameof(CanExecute))]
    private async Task ExecuteCommandAsync()
    {
        if (!CanExecute || SelectedCommand == null) return;

        var command = SelectedCommand;
        var devices = SelectedDevices.ToList();

        string[]? inputValues = null;
        if (command.RequiresInput)
        {
            // 校验输入项非空
            foreach (var item in ActiveInputs)
            {
                if (string.IsNullOrWhiteSpace(item.Value))
                {
                    _log.Warn($"请填写: {item.Label}", _moduleId);
                    StatusText = $"请填写: {item.Label}";
                    return;
                }
            }
            inputValues = ActiveInputs.Select(i => i.Value).ToArray();
            _log.Info($"[输入] {string.Join(" / ", inputValues)}", _moduleId);
        }

        IsBusy = true;
        _log.Info($"=== 执行命令: {command.Name} ===", _moduleId);
        StatusText = $"正在执行: {command.Name}";

        try
        {
            var tasks = devices.Select(device =>
                Task.Run(async () =>
                {
                    var result = await _execution.ExecuteAsync(
                        device.SerialNumber, command, inputValues);
                    return (device, result);
                }));

            var results = await Task.WhenAll(tasks);

            foreach (var (device, result) in results)
            {
                _log.Info($"--- [{device.DisplayName}] ---", _moduleId);
                _log.Info($"> {command.DisplayCommand}", _moduleId);
                if (result.Success)
                    _log.Info(string.IsNullOrEmpty(result.Output) ? "执行成功(无输出)" : result.Output, _moduleId);
                else
                    _log.Error($"[失败] {result.Error}", _moduleId);
                _log.Info($"耗时: {result.ElapsedMs}ms", _moduleId);
            }
        }
        catch (Exception ex)
        {
            _log.Error(ex.Message, _moduleId);
        }
        finally
        {
            StatusText = "就绪";
            IsBusy = false;
        }
    }

    [RelayCommand(CanExecute = nameof(CanExecute))]
    private async Task ExecuteGroupAsync()
    {
        if (!CanExecute || SelectedGroup == null) return;

        var group = SelectedGroup;
        var devices = SelectedDevices.ToList();

        string[]? inputValues = null;
        if (group.Steps.Any(s => s.RequiresInput))
        {
            foreach (var item in ActiveInputs)
            {
                if (string.IsNullOrWhiteSpace(item.Value))
                {
                    _log.Warn($"请填写: {item.Label}", _moduleId);
                    StatusText = $"请填写: {item.Label}";
                    return;
                }
            }
            inputValues = ActiveInputs.Select(i => i.Value).ToArray();
            _log.Info($"[输入] {string.Join(" / ", inputValues)}", _moduleId);
        }

        IsBusy = true;
        _log.Info($"=== 执行命令组: {group.Name} ===", _moduleId);
        StatusText = $"正在执行: {group.Name}";

        try
        {
            var tasks = devices.Select(device =>
                Task.Run(async () =>
                {
                    var results = await _execution.ExecuteGroupAsync(
                        device.SerialNumber, group, inputValues,
                        (stepIndex, step, stepResult, willAbort) =>
                            OnGroupStepCompleted(device, stepIndex, step, stepResult));
                    return (device, results);
                }));

            var allResults = await Task.WhenAll(tasks);

            foreach (var (device, execResult) in allResults)
            {
                var allPassed = execResult.Results.All(r => r.Success);
                if (execResult.Aborted)
                    _log.Info($"[{device.DisplayName}] 结果: 在第 {execResult.AbortedStepIndex} 步失败，已中断", _moduleId);
                else
                    _log.Info($"[{device.DisplayName}] 结果: {(allPassed ? "全部通过" : "存在失败项")}", _moduleId);
            }
        }
        catch (Exception ex)
        {
            _log.Error(ex.Message, _moduleId);
        }
        finally
        {
            StatusText = "就绪";
            IsBusy = false;
        }
    }

    /// <summary>命令组单步完成回调 — 实时输出（后台线程调用，LogService 线程安全）</summary>
    private void OnGroupStepCompleted(
        AdbDevice device, int stepIndex, CommandDefinition step, CommandResult stepResult)
    {
        var status = stepResult.Success ? "OK" : "FAIL";
        _log.Info($"[{device.DisplayName}] [{status}] 步骤{stepIndex}: {step.DisplayCommand} ({stepResult.ElapsedMs}ms)", _moduleId);
        if (!string.IsNullOrEmpty(stepResult.Output))
            _log.Info($"  {stepResult.Output.Trim()}", _moduleId);
        if (!string.IsNullOrEmpty(stepResult.Error))
            _log.Error($"  错误: {stepResult.Error.Trim()}", _moduleId);
    }

    // ==================== 命令管理 ====================

    [RelayCommand]
    private void OpenCommandManager()
    {
        var window = new Views.CommandManagerWindow(_library)
        {
            Owner = Application.Current.MainWindow
        };
        window.ShowDialog();
    }

    [RelayCommand]
    private void ClearLog()
    {
        _log.Clear();
    }

    // ==================== 内部 ====================

    /// <summary>重建统一参数输入区</summary>
    private void RebuildActiveInputs()
    {
        ActiveInputs.Clear();

        if (_selectedCommand?.RequiresInput == true)
        {
            foreach (var prompt in _selectedCommand.InputPrompts)
                ActiveInputs.Add(new InputField { Label = prompt });
        }
        else if (_selectedGroup != null)
        {
            var stepIndex = 0;
            foreach (var step in _selectedGroup.Steps)
            {
                stepIndex++;
                if (!step.RequiresInput) continue;

                var header = $"步骤{stepIndex}: {step.Name}";
                foreach (var prompt in step.InputPrompts)
                    ActiveInputs.Add(new InputField { GroupLabel = header, Label = prompt });
            }
        }

        OnPropertyChanged(nameof(HasInputPanel));
    }

    private void RebuildCommands()
    {
        Commands.Clear();
        var filtered = SelectedCategory == "全部"
            ? _library.Commands
            : _library.Commands.Where(c => c.Category == SelectedCategory);
        foreach (var cmd in filtered)
            Commands.Add(cmd);
    }

    private void RebuildGroups()
    {
        CommandGroups.Clear();
        var filtered = SelectedGroupCategory == "全部"
            ? _library.Groups
            : _library.Groups.Where(g => g.Category == SelectedGroupCategory);
        foreach (var g in filtered)
            CommandGroups.Add(g);
    }

    private void RefreshCategories()
    {
        var current = SelectedCategory;
        Categories.Clear();
        Categories.Add("全部");
        foreach (var cat in _library.Commands.Select(c => c.Category).Where(c => c != null).Distinct())
            Categories.Add(cat!);
        SelectedCategory = Categories.Contains(current) ? current : "全部";
        RebuildCommands();
    }

    private void RefreshGroupCategories()
    {
        var current = SelectedGroupCategory;
        GroupCategories.Clear();
        GroupCategories.Add("全部");
        foreach (var cat in _library.Groups.Select(g => g.Category).Where(c => c != null).Distinct())
            GroupCategories.Add(cat!);
        SelectedGroupCategory = GroupCategories.Contains(current) ? current : "全部";
        RebuildGroups();
    }

    // ==================== INotifyPropertyChanged ====================

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? name = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }

    private void OnCanExecuteChanged()
    {
        OnPropertyChanged(nameof(CanExecute));
        ExecuteCommandCommand.NotifyCanExecuteChanged();
        ExecuteGroupCommand.NotifyCanExecuteChanged();
    }
}