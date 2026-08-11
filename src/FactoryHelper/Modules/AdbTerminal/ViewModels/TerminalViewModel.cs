using System.Collections.ObjectModel;
using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using FactoryHelper.Modules.AdbTerminal.Models;
using FactoryHelper.Modules.AdbTerminal.Services;
using FactoryHelper.Platform;

namespace FactoryHelper.Modules.AdbTerminal.ViewModels;

/// <summary>
/// ADB 命令终端 ViewModel — 命令/命令组浏览、分类筛选、参数输入、执行、日志呈现。
/// 执行并发：直接收集任务 WhenAll（无 Task.Run，回调线程契约见 ExecutionService）。
/// 日志呈现：订阅平台日志（按 Source 过滤），SynchronizationContext 编组回 UI 线程。
/// </summary>
public partial class TerminalViewModel : ObservableObject
{
    private const int MaxLogEntries = 2000;

    private readonly CommandRepository _repository;
    private readonly ExecutionService _execution;
    private readonly IDeviceService _devices;
    private readonly ILogService _log;
    private readonly IWindowService _windows;
    private readonly string _moduleId;
    private readonly SynchronizationContext _sync;
    private bool _initialized;

    private CommandLibrary _library = new();

    // ==================== 集合 ====================

    public ObservableCollection<CommandDefinition> Commands { get; } = [];
    public ObservableCollection<CommandGroup> CommandGroups { get; } = [];
    public ObservableCollection<string> Categories { get; } = [];
    public ObservableCollection<string> GroupCategories { get; } = [];
    public ObservableCollection<InputField> ActiveInputs { get; } = [];
    public ObservableCollection<LogEntry> LogEntries { get; } = [];

    public bool HasInputPanel => ActiveInputs.Count > 0;

    // ==================== 属性 ====================

    [ObservableProperty]
    private CommandDefinition? _selectedCommand;

    partial void OnSelectedCommandChanged(CommandDefinition? value)
    {
        RebuildActiveInputs();
        OnCanExecuteChanged();
    }

    [ObservableProperty]
    private CommandGroup? _selectedGroup;

    partial void OnSelectedGroupChanged(CommandGroup? value)
    {
        RebuildActiveInputs();
        OnCanExecuteChanged();
    }

    [ObservableProperty]
    private string _selectedCategory = "全部";

    partial void OnSelectedCategoryChanged(string value) => RebuildCommands();

    [ObservableProperty]
    private string _selectedGroupCategory = "全部";

    partial void OnSelectedGroupCategoryChanged(string value) => RebuildGroups();

    [ObservableProperty]
    private string _statusText = "就绪";

    [ObservableProperty]
    private bool _isBusy;

    partial void OnIsBusyChanged(bool value) => OnCanExecuteChanged();

    /// <summary>执行可用性：空闲 + 有选中设备 + 选中命令/组</summary>
    public bool CanExecute => !IsBusy && _devices.HasSelectedDevices && (SelectedCommand != null || SelectedGroup != null);

    public TerminalViewModel(
        CommandRepository repository,
        ExecutionService execution,
        IDeviceService devices,
        ILogService log,
        string moduleId,
        IWindowService windows)
    {
        _repository = repository;
        _execution = execution;
        _devices = devices;
        _log = log;
        _moduleId = moduleId;
        _windows = windows;
        _sync = SynchronizationContext.Current ?? new SynchronizationContext();

        // 平台设备选择变化 → 刷新执行可用性（属性通知线程无关）
        _devices.SelectionChanged += OnCanExecuteChanged;
        // 命令库保存成功 → 重载最新库
        _repository.LibraryChanged += OnLibraryChanged;
        // 平台日志（后台线程）→ 过滤本模块 → 编组回 UI 线程追加
        _log.LogAdded += OnLogAdded;
    }

    /// <summary>视图加载后初始化（幂等：多次触发只加载一次）</summary>
    public async Task InitializeAsync()
    {
        if (_initialized)
            return;
        _initialized = true;

        StatusText = "正在加载命令库...";
        _library = await _repository.LoadAsync();
        _log.Info($"命令库加载完成: {_library.Commands.Count} 条命令, {_library.Groups.Count} 个命令组", _moduleId);
        ApplyLibrary();
        StatusText = "就绪";
    }

    // ==================== 执行 ====================

    [RelayCommand(CanExecute = nameof(CanExecute))]
    private async Task ExecuteCommandAsync()
    {
        if (SelectedCommand is not { } cmd || !_devices.HasSelectedDevices)
            return;

        var devices = _devices.SelectedDevices.ToList();
        if (cmd.RequiresInput && !ValidateInputs())
            return;
        var inputs = cmd.RequiresInput ? ActiveInputs.Select(i => i.Value).ToArray() : null;

        IsBusy = true;
        StatusText = $"正在执行: {cmd.Name}";
        _log.Info($"=== 执行命令: {cmd.Name} ===", _moduleId);
        try
        {
            // 多设备并行（执行引擎内部纯异步，无需 Task.Run）
            var results = await Task.WhenAll(devices.Select(d => _execution.ExecuteAsync(d.Serial, cmd, inputs)));
            foreach (var r in results)
                LogResult(r);
        }
        catch (Exception ex)
        {
            _log.Error($"执行异常: {ex.Message}", _moduleId);
        }
        finally
        {
            IsBusy = false;
            StatusText = "就绪";
        }
    }

    [RelayCommand(CanExecute = nameof(CanExecute))]
    private async Task ExecuteGroupAsync()
    {
        if (SelectedGroup is not { } group || !_devices.HasSelectedDevices)
            return;

        var devices = _devices.SelectedDevices.ToList();
        var promptCount = group.Steps.Where(s => s.RequiresInput).Sum(s => s.InputPrompts.Count);
        if (promptCount > 0 && !ValidateInputs())
            return;
        var inputs = promptCount > 0 ? ActiveInputs.Select(i => i.Value).ToArray() : null;

        IsBusy = true;
        StatusText = $"正在执行: {group.Name}";
        _log.Info($"=== 执行命令组: {group.Name} ===", _moduleId);
        try
        {
            // 步骤级回调在后台线程（LogService 线程安全），日志编组在 OnLogAdded
            var results = await Task.WhenAll(devices.Select(d =>
                _execution.ExecuteGroupAsync(d.Serial, group, inputs,
                    onStep: (stepIndex, stepResult, willAbort) => LogStepResult(d.Serial, stepIndex, stepResult, willAbort))));

            foreach (var (device, execResult) in results.Select((r, i) => (devices[i], r)))
            {
                var summary = execResult.Aborted
                    ? $"在第 {execResult.AbortedStepIndex} 步失败，已中断"
                    : execResult.AllPassed ? "全部通过" : "存在失败项";
                _log.Info($"[{device.DisplayName}] 结果: {summary}", _moduleId);
            }
        }
        catch (Exception ex)
        {
            _log.Error($"执行异常: {ex.Message}", _moduleId);
        }
        finally
        {
            IsBusy = false;
            StatusText = "就绪";
        }
    }

    [RelayCommand]
    private void OpenCommandManager()
    {
        var viewModel = new CommandManagerViewModel(_library.DeepClone(), _repository, _windows);
        _windows.ShowCommandManager(viewModel);
    }

    /// <summary>清空日志面板（仅本 VM 集合，平台日志文件不受影响）</summary>
    [RelayCommand]
    private void ClearLog() => _sync.Post(_ => LogEntries.Clear(), null);

    // ==================== 内部 ====================

    private void LogResult(CommandResult r)
    {
        if (r.Success)
            _log.Info($"[{r.DeviceSerial}] > {r.Command} — 成功 ({r.ElapsedMs}ms){(string.IsNullOrEmpty(r.Output) ? "" : $"\n{r.Output}")}", _moduleId);
        else
            _log.Error($"[{r.DeviceSerial}] > {r.Command} — 失败: {r.Error} ({r.Source}, {r.ElapsedMs}ms)", _moduleId);
    }

    private void LogStepResult(string serial, int stepIndex, CommandResult r, bool willAbort)
    {
        var status = r.Success ? "OK" : $"FAIL{(willAbort ? "·中断" : "")}";
        _log.Info($"[{serial}] [{status}] 步骤{stepIndex}: {r.Command} ({r.ElapsedMs}ms)", _moduleId);
        if (!string.IsNullOrEmpty(r.Output))
            _log.Info($"  {r.Output.Trim()}", _moduleId);
        if (!string.IsNullOrEmpty(r.Error))
            _log.Error($"  {r.Error.Trim()}", _moduleId);
    }

    /// <summary>校验输入区非空（不合法返回 false，日志+状态提示）</summary>
    private bool ValidateInputs()
    {
        var empty = ActiveInputs.FirstOrDefault(i => string.IsNullOrWhiteSpace(i.Value));
        if (empty is not null)
        {
            _log.Warn($"请填写: {empty.Label}", _moduleId);
            StatusText = $"请填写: {empty.Label}";
            return false;
        }
        return true;
    }

    private void OnLogAdded(LogEntry entry)
    {
        if (entry.Source != _moduleId)
            return; // 按 Source 过滤：其他模块日志不混入终端面板
        _sync.Post(_ =>
        {
            LogEntries.Add(entry);
            if (LogEntries.Count > MaxLogEntries)
                LogEntries.RemoveAt(0); // 上限裁剪，防无限增长
        }, null);
    }

    private void OnLibraryChanged() => _sync.Post(_ => RefreshLibrary(), null);

    private async void RefreshLibrary()
    {
        try
        {
            _library = await _repository.LoadAsync();
            ApplyLibrary();
        }
        catch (Exception ex)
        {
            _log.Error($"命令库重载失败: {ex.Message}", _moduleId);
        }
    }

    private void ApplyLibrary()
    {
        Commands.Clear();
        foreach (var cmd in _library.Commands)
            Commands.Add(cmd);
        CommandGroups.Clear();
        foreach (var group in _library.Groups)
            CommandGroups.Add(group);
        RefreshCategories();
        RefreshGroupCategories();
    }

    private void RebuildCommands()
    {
        Commands.Clear();
        foreach (var cmd in SelectedCategory == "全部"
                     ? _library.Commands
                     : _library.Commands.Where(c => c.Category == SelectedCategory))
            Commands.Add(cmd);
    }

    private void RebuildGroups()
    {
        CommandGroups.Clear();
        foreach (var group in SelectedGroupCategory == "全部"
                     ? _library.Groups
                     : _library.Groups.Where(g => g.Category == SelectedGroupCategory))
            CommandGroups.Add(group);
    }

    private void RefreshCategories()
    {
        var current = SelectedCategory;
        Categories.Clear();
        Categories.Add("全部");
        foreach (var cat in _library.Categories)
            Categories.Add(cat);
        if (!Categories.Contains(current))
            SelectedCategory = "全部";
        else
            RebuildCommands();
    }

    private void RefreshGroupCategories()
    {
        var current = SelectedGroupCategory;
        GroupCategories.Clear();
        GroupCategories.Add("全部");
        foreach (var cat in _library.Categories)
            GroupCategories.Add(cat);
        if (!GroupCategories.Contains(current))
            SelectedGroupCategory = "全部";
        else
            RebuildGroups();
    }

    /// <summary>重建统一参数输入区（选中命令或命令组时按需生成）</summary>
    private void RebuildActiveInputs()
    {
        ActiveInputs.Clear();

        if (SelectedCommand?.RequiresInput == true)
        {
            foreach (var prompt in SelectedCommand.InputPrompts)
                ActiveInputs.Add(new InputField { Label = prompt });
        }
        else if (SelectedGroup != null)
        {
            var stepIndex = 0;
            foreach (var step in SelectedGroup.Steps)
            {
                stepIndex++;
                if (!step.RequiresInput)
                    continue;
                var header = $"步骤{stepIndex}: {step.Name}";
                foreach (var prompt in step.InputPrompts)
                    ActiveInputs.Add(new InputField { GroupLabel = header, Label = prompt });
            }
        }

        OnPropertyChanged(nameof(HasInputPanel));
    }

    private void OnCanExecuteChanged()
    {
        OnPropertyChanged(nameof(CanExecute));
        ExecuteCommandCommand.NotifyCanExecuteChanged();
        ExecuteGroupCommand.NotifyCanExecuteChanged();
    }
}
