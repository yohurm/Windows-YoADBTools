using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Yovo.Modules.AdbTerminal.Application;
using Yovo.Modules.AdbTerminal.Domain;
using Yovo.Platform.Abstractions;
using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Logging;

namespace Yovo.Modules.AdbTerminal.Presentation.ViewModels;

/// <summary>
/// ADB 命令终端 ViewModel — 命令/命令组浏览、分类筛选、参数输入、执行、日志呈现。
/// 执行并发：直接收集任务 WhenAll（无 Task.Run，回调线程契约见 ExecutionService）。
/// 日志呈现：订阅平台日志（按 Source 过滤），IUiDispatcher 编组回 UI 线程。
/// 设备：模块作用域多选（hub.GetSelection），选中变化刷新执行可用性。
/// P0-4：命令与命令组选中互斥，执行按钮 CanExecute 独立。
/// </summary>
public partial class TerminalViewModel : ObservableObject
{
    private const int MaxLogEntries = 2000;

    private readonly CommandRepository _repository;
    private readonly ExecutionService _execution;
    private readonly IDeviceSessionHub _hub;
    private readonly IDeviceDirectory _directory;
    private readonly IAppLog _log;
    private readonly IWindowService _windows;
    private readonly IUiDispatcher _ui;
    private readonly IAppLifecycle _lifecycle;
    private readonly IDisposable _logSubscription;
    private bool _initialized;

    private CommandLibrary _library = new();

    // ==================== 集合 ====================

    public ObservableCollection<CommandDefinition> Commands { get; } = [];
    public ObservableCollection<CommandGroup> CommandGroups { get; } = [];
    public ObservableCollection<string> Categories { get; } = [];
    public ObservableCollection<string> GroupCategories { get; } = [];
    public ObservableCollection<InputField> ActiveInputs { get; } = [];
    public ObservableCollection<AppLogEntry> LogEntries { get; } = [];

    public bool HasInputPanel => ActiveInputs.Count > 0;

    // ==================== 属性 ====================

    [ObservableProperty]
    private CommandDefinition? _selectedCommand;

    /// <summary>互斥选中（P0-4）：选中命令 → 清空命令组选中，防止误执行旧命令</summary>
    partial void OnSelectedCommandChanged(CommandDefinition? value)
    {
        if (value is not null)
            SelectedGroup = null;
        RebuildActiveInputs();
        OnCanExecuteChanged();
    }

    [ObservableProperty]
    private CommandGroup? _selectedGroup;

    partial void OnSelectedGroupChanged(CommandGroup? value)
    {
        if (value is not null)
            SelectedCommand = null;
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

    /// <summary>执行单条命令可用性：空闲 + 选中设备 + 仅选中命令（P0-4 拆分）</summary>
    public bool CanExecuteCommand =>
        !IsBusy && HasSelectedDevices && SelectedCommand != null;

    /// <summary>执行命令组可用性：空闲 + 选中设备 + 仅选中命令组（P0-4 拆分）</summary>
    public bool CanExecuteGroup =>
        !IsBusy && HasSelectedDevices && SelectedGroup != null;

    /// <summary>当前模块作用域是否有在线设备（hub 只读查询，线程安全）</summary>
    private bool HasSelectedDevices =>
        _hub.GetSelection(AdbTerminalModule.ModuleId).Serials.Count > 0;

    public TerminalViewModel(
        CommandRepository repository,
        ExecutionService execution,
        IDeviceSessionHub hub,
        IDeviceDirectory directory,
        IAppLog log,
        IWindowService windows,
        IUiDispatcher ui,
        IAppLifecycle lifecycle)
    {
        _repository = repository;
        _execution = execution;
        _hub = hub;
        _directory = directory;
        _log = log;
        _windows = windows;
        _ui = ui;
        _lifecycle = lifecycle;
        _directoryDevicesCache = [.. directory.Devices];

        // 模块作用域选择变化 → 刷新执行可用性
        _hub.SelectionChanged += OnHubSelectionChanged;
        // 设备目录刷新 → 更新设备快照缓存
        _directory.DevicesChanged += () => _directoryDevicesCache = [.. _directory.Devices];
        // 命令库保存成功 → 重载最新库
        _repository.LibraryChanged += OnLibraryChanged;
        // 平台日志（后台线程）→ 过滤本模块 → 编组回 UI 线程追加
        _logSubscription = _log.Subscribe(new AppLogFilter(Source: AdbTerminalModule.ModuleId), OnLogAdded);
    }

    /// <summary>视图加载后初始化（幂等：多次触发只加载一次）</summary>
    public async Task InitializeAsync()
    {
        if (_initialized)
            return;
        _initialized = true;

        StatusText = "正在加载命令库...";
        try
        {
            _library = await _repository.LoadAsync();
            _log.Info($"命令库加载完成: {_library.Commands.Count} 条命令, {_library.Groups.Count} 个命令组",
                AdbTerminalModule.ModuleId);
            ApplyLibrary();
        }
        catch (Exception ex)
        {
            _log.Error($"命令库加载失败: {ex.Message}", AdbTerminalModule.ModuleId);
        }
        StatusText = "就绪";
    }

    // ==================== 执行 ====================

    [RelayCommand(CanExecute = nameof(CanExecuteCommand))]
    private async Task ExecuteCommandAsync()
    {
        if (SelectedCommand is not { } cmd)
            return;

        var devices = GetSelectedDevices();
        if (devices.Count == 0)
            return;
        if (cmd.RequiresInput && !ValidateInputs())
            return;
        var inputs = cmd.RequiresInput ? ActiveInputs.Select(i => i.Value).ToArray() : null;

        IsBusy = true;
        StatusText = $"正在执行: {cmd.Name}";
        _log.Info($"=== 执行命令: {cmd.Name} ===", AdbTerminalModule.ModuleId);
        try
        {
            // 多设备并行（执行引擎内部纯异步，无需 Task.Run）
            // P1-4：执行链入应用退出信号（关窗后长命令不残留）
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(_lifecycle.ShutdownToken);
            var results = await Task.WhenAll(devices.Select(d => _execution.ExecuteAsync(d.Serial, cmd, inputs, linked.Token)));
            foreach (var r in results)
                LogResult(r);
        }
        catch (Exception ex)
        {
            _log.Error($"执行异常: {ex.Message}", AdbTerminalModule.ModuleId);
        }
        finally
        {
            IsBusy = false;
            StatusText = "就绪";
        }
    }

    [RelayCommand(CanExecute = nameof(CanExecuteGroup))]
    private async Task ExecuteGroupAsync()
    {
        if (SelectedGroup is not { } group)
            return;

        var devices = GetSelectedDevices();
        if (devices.Count == 0)
            return;
        var promptCount = group.Steps.Where(s => s.RequiresInput).Sum(s => s.InputPrompts.Count);
        if (promptCount > 0 && !ValidateInputs())
            return;
        var inputs = promptCount > 0 ? ActiveInputs.Select(i => i.Value).ToArray() : null;

        IsBusy = true;
        StatusText = $"正在执行: {group.Name}";
        _log.Info($"=== 执行命令组: {group.Name} ===", AdbTerminalModule.ModuleId);
        try
        {
            // 步骤级回调在后台线程（IAppLog 线程安全），日志编组在 OnLogAdded
            // P1-4：命令组执行链入应用退出信号
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(_lifecycle.ShutdownToken);
            var results = await Task.WhenAll(devices.Select(d =>
                _execution.ExecuteGroupAsync(d.Serial, group, inputs,
                    onStep: (stepIndex, stepResult, willAbort) => LogStepResult(d.Serial, stepIndex, stepResult, willAbort),
                    ct: linked.Token)));

            foreach (var (device, execResult) in results.Select((r, i) => (devices[i], r)))
            {
                var summary = execResult.Aborted
                    ? $"在第 {execResult.AbortedStepIndex} 步失败，已中断"
                    : execResult.AllPassed ? "全部通过" : "存在失败项";
                _log.Info($"[{device.DisplayName}] 结果: {summary}", AdbTerminalModule.ModuleId);
            }
        }
        catch (Exception ex)
        {
            _log.Error($"执行异常: {ex.Message}", AdbTerminalModule.ModuleId);
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
        var viewModel = new CommandManagerViewModel(_library.DeepClone(), _repository);
        _windows.ShowDetached("CommandManagerWindow", viewModel, new WindowOptions(
            Title: "命令库管理", Width: 1100, Height: 700, IsModal: true, CenterOwner: true));
    }

    /// <summary>清空日志面板（仅本 VM 集合，平台日志缓冲不受影响）</summary>
    [RelayCommand]
    private void ClearLog() => _ui.Post(() => LogEntries.Clear());

    // ==================== 内部 ====================

    /// <summary>当前模块作用域的在线设备（hub 快照）</summary>
    private List<AdbDevice> GetSelectedDevices()
    {
        var selection = _hub.GetSelection(AdbTerminalModule.ModuleId);
        var serials = selection.Serials.ToHashSet();
        return _directoryDevicesCache.Where(d => serials.Contains(d.Serial)).ToList();
    }

    /// <summary>设备目录快照缓存（刷新时由目录事件更新）</summary>
    private List<AdbDevice> _directoryDevicesCache = [];

    private void LogResult(CommandResult r)
    {
        if (r.Success)
            _log.Info($"[{r.DeviceSerial}] > {r.Command} — 成功 ({r.ElapsedMs}ms){(string.IsNullOrEmpty(r.Output) ? "" : $"\n{r.Output}")}", AdbTerminalModule.ModuleId);
        else
            _log.Error($"[{r.DeviceSerial}] > {r.Command} — 失败: {r.Error} ({r.Source}, {r.ElapsedMs}ms)", AdbTerminalModule.ModuleId);
    }

    private void LogStepResult(DeviceSerial serial, int stepIndex, CommandResult r, bool willAbort)
    {
        var status = r.Success ? "OK" : $"FAIL{(willAbort ? "·中断" : "")}";
        _log.Info($"[{serial}] [{status}] 步骤{stepIndex}: {r.Command} ({r.ElapsedMs}ms)", AdbTerminalModule.ModuleId);
        if (!string.IsNullOrEmpty(r.Output))
            _log.Info($"  {r.Output.Trim()}", AdbTerminalModule.ModuleId);
        if (!string.IsNullOrEmpty(r.Error))
            _log.Error($"  {r.Error.Trim()}", AdbTerminalModule.ModuleId);
    }

    /// <summary>校验输入区非空（不合法返回 false，日志+状态提示）</summary>
    private bool ValidateInputs()
    {
        var empty = ActiveInputs.FirstOrDefault(i => string.IsNullOrWhiteSpace(i.Value));
        if (empty is not null)
        {
            _log.Warn($"请填写: {empty.Label}", AdbTerminalModule.ModuleId);
            StatusText = $"请填写: {empty.Label}";
            return false;
        }
        return true;
    }

    private void OnLogAdded(AppLogEntry entry)
    {
        // Source 过滤由订阅 filter 完成；编组回 UI 线程追加
        _ui.Post(() =>
        {
            LogEntries.Add(entry);
            if (LogEntries.Count > MaxLogEntries)
                LogEntries.RemoveAt(0); // 上限裁剪，防无限增长
        });
    }

    private void OnHubSelectionChanged(string moduleId)
    {
        if (moduleId != AdbTerminalModule.ModuleId && moduleId != string.Empty)
            return;
        _ui.Post(OnCanExecuteChanged);
    }

    private void OnLibraryChanged() => _ui.Post(RefreshLibrary);

    private async void RefreshLibrary()
    {
        try
        {
            _library = await _repository.LoadAsync();
            ApplyLibrary();
        }
        catch (Exception ex)
        {
            _log.Error($"命令库重载失败: {ex.Message}", AdbTerminalModule.ModuleId);
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
        OnPropertyChanged(nameof(CanExecuteCommand));
        OnPropertyChanged(nameof(CanExecuteGroup));
        ExecuteCommandCommand.NotifyCanExecuteChanged();
        ExecuteGroupCommand.NotifyCanExecuteChanged();
    }
}
