using System.Collections.ObjectModel;
using System.IO;
using System.Windows;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Yovo.Modules.LogAnalyzer.Application;
using Yovo.Platform.Abstractions;
using Yovo.Platform.Abstractions.Adb;
using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Logging;
using Yovo.Platform.Abstractions.Settings;
using Yovo.Platform.Abstractions.Tasks;

namespace Yovo.Modules.LogAnalyzer.Presentation.ViewModels;

/// <summary>
/// 日志分析 ViewModel — 采集（流式）/ 过滤（级别含以上 + Tag + 关键字 + PID）/ 暂停/清空/导出。
/// P1 迭代（日志分析模块架构）：F20 软换行 / F22 清设备缓冲 / F23 复制 / F25 PID /
/// F26 信号计数 / F27 过滤变更重放缓冲。
/// 性能约束：消费端过滤；UI 100ms 批量节流 + 虚拟化；显示上限裁剪（缓冲仍全量）。
/// </summary>
public partial class LogAnalyzerViewModel : ObservableObject
{
    public const string DisplayLimitKey = "display.limit";
    public const string ClearDeviceOnStartKey = "clear.device.on.start";
    private const int DefaultDisplayLimit = 2000;
    private const int BatchIntervalMs = 100;

    private readonly LogcatCaptureService _capture;
    private readonly IDeviceSessionHub _hub;
    private readonly IAppPaths _paths;
    private readonly IAppLog _log;
    private readonly IUiDispatcher _ui;
    private readonly IBackgroundTaskCenter _tasks;
    private readonly IAppLifecycle _lifecycle;
    private readonly ISettingsStore _settings;
    private readonly IAdbCommandExecutor _adb;
    private readonly LogPresetStore _presetStore;
    private readonly int _displayLimit;
    private BackgroundTaskId? _taskId;
    private CancellationTokenSource? _captureCts;

    /// <summary>正在采集的设备（P1-1：焦点切换为其他设备时停采）</summary>
    private DeviceSerial? _captureSerial;

    /// <summary>可见列表（F34：连续栈帧折叠为单行）</summary>
    public ObservableCollection<DisplayLine> VisibleLines { get; } = [];

    [ObservableProperty]
    private string _selectedLevel = "全部";

    partial void OnSelectedLevelChanged(string value) => RebuildVisibleFromBuffer();

    [ObservableProperty]
    private string _tagFilter = string.Empty;

    partial void OnTagFilterChanged(string value) => RebuildVisibleFromBuffer();

    /// <summary>消息关键字（包含匹配，不区分大小写；不做正则 — F06）</summary>
    [ObservableProperty]
    private string _keywordFilter = string.Empty;

    partial void OnKeywordFilterChanged(string value) => RebuildVisibleFromBuffer();

    /// <summary>PID 过滤（F25：文本包含匹配）</summary>
    [ObservableProperty]
    private string _pidFilter = string.Empty;

    partial void OnPidFilterChanged(string value) => RebuildVisibleFromBuffer();

    /// <summary>软换行（F20：默认开，对齐 AS Soft-Wrap）</summary>
    [ObservableProperty]
    private bool _isSoftWrap = true;

    /// <summary>当前选中行（F23 复制用）</summary>
    [ObservableProperty]
    private DisplayLine? _selectedLine;

    /// <summary>命名过滤预设（F31）</summary>
    public ObservableCollection<LogPreset> Presets { get; } = [];

    [ObservableProperty]
    private LogPreset? _selectedPreset;

    /// <summary>预设名输入回调（View 注入；null = 跳过保存）</summary>
    public Func<string>? PromptPresetName { get; set; }

    partial void OnSelectedPresetChanged(LogPreset? value)
    {
        if (value is null)
            return;
        // 应用预设 → 触发各过滤属性变更 → 重放缓冲
        SelectedLevel = value.Level;
        TagFilter = value.Tag;
        KeywordFilter = value.Keyword;
        PidFilter = value.Pid;
        StatusText = $"已应用预设: {value.Name}";
    }

    /// <summary>可见集合中崩溃/异常信号行数（F26）</summary>
    [ObservableProperty]
    private int _signalCount;

    [ObservableProperty]
    private string _statusText = "选择设备后开始采集";

    [ObservableProperty]
    private bool _isCapturing;

    /// <summary>暂停中（界面冻结，缓冲继续）</summary>
    [ObservableProperty]
    private bool _isPaused;

    /// <summary>暂停可用性：仅在采集中</summary>
    public bool CanPause => IsCapturing;

    /// <summary>清设备缓冲可用性：有焦点设备</summary>
    public bool CanClearDeviceBuffer => _hub.ActiveDevice is not null;

    partial void OnIsCapturingChanged(bool value) => OnPropertyChanged(nameof(CanPause));

    /// <summary>级别过滤选项</summary>
    public IReadOnlyList<string> LevelOptions { get; } =
        ["全部", "V", "D", "I", "W", "E", "F"];

    /// <summary>当前过滤条件快照（LogFilter 纯函数消费）</summary>
    private LogFilterOptions CurrentFilter => new(
        SelectedLevel == "全部" ? null : SelectedLevel,
        TagFilter,
        KeywordFilter,
        PidFilter);

    public LogAnalyzerViewModel(
        LogcatCaptureService capture,
        IDeviceSessionHub hub,
        IAppPaths paths,
        IAppLog log,
        IUiDispatcher ui,
        IBackgroundTaskCenter tasks,
        IAppLifecycle lifecycle,
        ISettingsStore settings,
        IAdbCommandExecutor adb,
        LogPresetStore presetStore)
    {
        _capture = capture;
        _hub = hub;
        _paths = paths;
        _log = log;
        _ui = ui;
        _tasks = tasks;
        _lifecycle = lifecycle;
        _settings = settings;
        _adb = adb;
        _presetStore = presetStore;
        _displayLimit = Math.Clamp(
            _settings.Get(SettingsScope.Module(LogAnalyzerModule.ModuleId), DisplayLimitKey, DefaultDisplayLimit),
            500, 50_000);

        // 加载命名过滤预设（F31）
        foreach (var preset in _presetStore.Load())
            Presets.Add(preset);

        // 设备掉线 / 切换 → 自动停止采集
        _hub.ActiveDeviceChanged += () => _ui.Post(StopIfDeviceGone);
        _capture.CaptureStopped += () => _ui.Post(OnCaptureStopped);

        // 消费端节流：后台循环批量取行（100ms），编组回 UI 线程追加
        _ = DrainLoopAsync();
    }

    /// <summary>保存当前过滤条件为命名预设（F31；名称由 View 输入框提供）</summary>
    [RelayCommand]
    private void SavePreset()
    {
        if (PromptPresetName is not { } prompt)
            return;
        var name = prompt();
        if (string.IsNullOrWhiteSpace(name))
            return;

        var preset = new LogPreset(
            name.Trim(),
            SelectedLevel,
            TagFilter.Trim(),
            KeywordFilter.Trim(),
            PidFilter.Trim());
        if (Presets.FirstOrDefault(p => p.Name == preset.Name) is { } existing)
            Presets.Remove(existing);
        Presets.Add(preset);
        SelectedPreset = preset;
        StatusText = _presetStore.Save(Presets.ToList())
            ? $"已保存预设: {preset.Name}"
            : "预设保存失败";
    }

    /// <summary>删除当前选中预设（F31）</summary>
    [RelayCommand]
    private void DeletePreset()
    {
        if (SelectedPreset is not { } preset)
            return;
        Presets.Remove(preset);
        SelectedPreset = null;
        StatusText = _presetStore.Save(Presets.ToList())
            ? $"已删除预设: {preset.Name}"
            : "预设删除失败";
    }

    [RelayCommand]
    private async Task ToggleCaptureAsync()
    {
        if (IsCapturing)
        {
            StopCapture();
            return;
        }

        if (_hub.ActiveDevice is not { } device)
        {
            StatusText = "请先选择设备";
            return;
        }

        // H2：采集链入应用退出信号（退出时自动停止）
        _captureCts = CancellationTokenSource.CreateLinkedTokenSource(_lifecycle.ShutdownToken);
        try
        {
            // 设置：开始前清空设备缓冲（adb logcat -c）
            if (_settings.Get(SettingsScope.Module(LogAnalyzerModule.ModuleId), ClearDeviceOnStartKey, false))
            {
                StatusText = "正在清空设备 log 缓冲…";
                await _adb.ExecuteAsync(device.Serial, "logcat -c", TimeSpan.FromSeconds(10), _captureCts.Token);
            }

            await _capture.StartAsync(device.Serial, _captureCts.Token);
            _captureSerial = device.Serial; // P1-1：记录采集目标
            IsCapturing = true;
            StatusText = $"正在采集 {device.DisplayName} 的 logcat";
            _taskId = _tasks.Register(new BackgroundTaskDescriptor(
                "logcat 采集", LogAnalyzerModule.ModuleId,
                Detail: device.DisplayName));
        }
        catch (Exception ex)
        {
            _log.Error($"启动采集失败: {ex.Message}", LogAnalyzerModule.ModuleId);
            StatusText = $"启动失败: {ex.Message}";
        }
    }

    /// <summary>清空设备 log 缓冲（F22：即时操作，独立于设置项）</summary>
    [RelayCommand(CanExecute = nameof(CanClearDeviceBuffer))]
    private async Task ClearDeviceBufferAsync()
    {
        if (_hub.ActiveDevice is not { } device)
            return;
        try
        {
            StatusText = "正在清空设备 log 缓冲…";
            await _adb.ExecuteAsync(device.Serial, "logcat -c", TimeSpan.FromSeconds(10), _lifecycle.ShutdownToken);
            StatusText = "已清空设备 log 缓冲";
        }
        catch (Exception ex)
        {
            _log.Error($"清空设备缓冲失败: {ex.Message}", LogAnalyzerModule.ModuleId);
            StatusText = $"清空失败: {ex.Message}";
        }
    }

    /// <summary>复制选中行原文（F23）</summary>
    [RelayCommand]
    private void CopySelected()
    {
        if (SelectedLine is { } line)
        {
            Clipboard.SetText(line.FullRaw); // 折叠行复制完整原文（F34）
            StatusText = "已复制选中行";
        }
    }

    /// <summary>复制全部可见行原文（F23）</summary>
    [RelayCommand]
    private void CopyVisible()
    {
        if (VisibleLines.Count == 0)
            return;
        Clipboard.SetText(string.Join('\n', VisibleLines.Select(l => l.FullRaw))); // 折叠行输出完整原文（F34）
        StatusText = $"已复制 {VisibleLines.Count} 行";
    }

    [RelayCommand(CanExecute = nameof(CanPause))]
    private void Pause()
    {
        IsPaused = !IsPaused;
        PauseCommand.NotifyCanExecuteChanged();
        StatusText = IsPaused ? "已暂停（缓冲继续，界面冻结）" : "采集恢复";
    }

    [RelayCommand]
    private void Clear()
    {
        VisibleLines.Clear();
        _capture.ClearBuffer();
        SignalCount = 0;
        StatusText = "已清空";
    }

    [RelayCommand]
    private void Export()
    {
        try
        {
            var exportDir = Path.Combine(_paths.ModuleData(LogAnalyzerModule.ModuleId), "exports");
            Directory.CreateDirectory(exportDir);
            var file = Path.Combine(exportDir, $"logcat-{DateTime.Now:yyyyMMdd-HHmmss}.txt");

            // 导出过滤后的缓冲快照（过滤逻辑与显示一致；缓冲全量可导出）
            var filtered = _capture.BufferSnapshot().Where(l => LogFilter.Matches(l, CurrentFilter)).ToList();
            File.WriteAllLines(file, filtered.Select(l => l.Raw));
            StatusText = $"已导出 {filtered.Count} 行 → {file}";
        }
        catch (Exception ex)
        {
            _log.Error($"导出失败: {ex.Message}", LogAnalyzerModule.ModuleId);
            StatusText = $"导出失败: {ex.Message}";
        }
    }

    /// <summary>导出 JSON（F32）：当前可见行（含折叠完整原文）结构化输出</summary>
    [RelayCommand]
    private void ExportJson()
    {
        try
        {
            var exportDir = Path.Combine(_paths.ModuleData(LogAnalyzerModule.ModuleId), "exports");
            Directory.CreateDirectory(exportDir);
            var file = Path.Combine(exportDir, $"logcat-{DateTime.Now:yyyyMMdd-HHmmss}.json");

            var entries = VisibleLines.Select(d => new
            {
                d.Primary.Timestamp,
                d.Primary.Pid,
                d.Primary.Tid,
                d.Primary.Level,
                d.Primary.Tag,
                Message = d.FullRaw, // 折叠行输出完整原文（F34）
                Collapsed = d.CollapsedCount
            });
            File.WriteAllText(file, System.Text.Json.JsonSerializer.Serialize(entries,
                new System.Text.Json.JsonSerializerOptions { WriteIndented = true }));
            StatusText = $"已导出 JSON {VisibleLines.Count} 行 → {file}";
        }
        catch (Exception ex)
        {
            _log.Error($"导出 JSON 失败: {ex.Message}", LogAnalyzerModule.ModuleId);
            StatusText = $"导出 JSON 失败: {ex.Message}";
        }
    }

    // ==================== 内部 ====================

    /// <summary>
    /// 消费端节流循环：循环取当前世代行流 → 批量过滤 → UI 追加（上限裁剪）。
    /// 世代通道关闭（停止/重启）后取下一个世代（C1 修复：停止后可再次采集）。
    /// </summary>
    private async Task DrainLoopAsync()
    {
        while (true)
        {
            var reader = _capture.Lines;
            var batch = new List<LogcatLine>();

            while (await reader.WaitToReadAsync())
            {
                batch.Clear();
                while (reader.TryRead(out var line))
                    batch.Add(line);
                if (batch.Count == 0)
                    continue;

                var visible = batch.Where(l => LogFilter.Matches(l, CurrentFilter)).ToList();
                if (visible.Count == 0)
                    continue;

                _ui.Post(() =>
                {
                    if (IsPaused)
                        return;
                    // F34：连续栈帧折叠为单行后追加
                    foreach (var display in LogStackCollapser.Collapse(visible))
                    {
                        VisibleLines.Add(display);
                        if (VisibleLines.Count > _displayLimit)
                            VisibleLines.RemoveAt(0); // 显示上限裁剪（缓冲仍全量）
                    }
                    SignalCount = LogSignalScanner.CountSignals(VisibleLines.Select(d => d.Primary));
                });
                await Task.Delay(BatchIntervalMs);
            }

            // 当前世代关闭：停止（正常）或进程意外结束——短暂等待后取新世代（等待重新开始）
            await Task.Delay(200);
        }
    }

    /// <summary>
    /// 过滤条件变更 → 从缓冲重放可见列表（F27：级别/Tag/关键字/PID 变更立即生效）。
    /// 取缓冲尾部 displayLimit 行（保持"最新优先"语义）。
    /// </summary>
    private void RebuildVisibleFromBuffer()
    {
        _ui.Post(() =>
        {
            var filtered = _capture.BufferSnapshot()
                .Where(l => LogFilter.Matches(l, CurrentFilter))
                .ToList();
            // 尾部截断：保留最新的 displayLimit 行（F27）
            var take = filtered.Count > _displayLimit ? filtered.GetRange(filtered.Count - _displayLimit, _displayLimit) : filtered;

            // F34：重放同样折叠连续栈帧
            var collapsed = LogStackCollapser.Collapse(take);
            VisibleLines.Clear();
            foreach (var display in collapsed)
                VisibleLines.Add(display);
            SignalCount = LogSignalScanner.CountSignals(VisibleLines.Select(d => d.Primary));
        });
    }

    /// <summary>
    /// 焦点变化（P1-1）：焦点清空或切换为其他设备 → 停采当前设备。
    /// （切到新设备重采属产品决策，本期仅停止并提示。）
    /// </summary>
    private void StopIfDeviceGone()
    {
        if (!IsCapturing)
            return;
        var active = _hub.ActiveDevice;
        if (active is null || active.Serial != _captureSerial)
        {
            StopCapture();
            StatusText = active is null ? "设备已掉线，采集已停止" : $"设备已切换，采集已停止（当前: {active.DisplayName}）";
        }
    }

    private void StopCapture()
    {
        _capture.Stop();
        _captureCts?.Cancel();
        if (_taskId is { } id)
            _tasks.Complete(id, BackgroundTaskCompletion.Canceled);
        _taskId = null;
    }

    private void OnCaptureStopped()
    {
        IsCapturing = false;
        if (_taskId is { } id)
            _tasks.Complete(id, BackgroundTaskCompletion.Failed);
        _taskId = null;
        StatusText = "采集已停止";
    }
}
