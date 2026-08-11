using System.Collections.ObjectModel;
using System.IO;
using System.Text.RegularExpressions;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Yovo.Modules.LogAnalyzer.Application;
using Yovo.Platform.Abstractions;
using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Logging;
using Yovo.Platform.Abstractions.Tasks;

namespace Yovo.Modules.LogAnalyzer.Presentation.ViewModels;

/// <summary>
/// 日志分析 ViewModel — 采集 logcat（流式）、过滤（级别/tag/正则）、暂停/清空/导出。
/// 性能约束（v5 §13.4）：消费端过滤；UI 侧 100ms 批量节流 + 虚拟化列表；显示上限裁剪。
/// 设备 SingleRequired（全局焦点）；设备掉线自动停止采集。
/// </summary>
public partial class LogAnalyzerViewModel : ObservableObject
{
    private const int DisplayLimit = 2000;
    private const int BatchIntervalMs = 100;

    private readonly LogcatCaptureService _capture;
    private readonly IDeviceSessionHub _hub;
    private readonly IAppPaths _paths;
    private readonly IAppLog _log;
    private readonly IUiDispatcher _ui;
    private readonly IBackgroundTaskCenter _tasks;
    private BackgroundTaskId? _taskId;
    private CancellationTokenSource? _captureCts;

    public ObservableCollection<LogcatLine> VisibleLines { get; } = [];

    [ObservableProperty]
    private string _selectedLevel = "全部";

    [ObservableProperty]
    private string _tagFilter = string.Empty;

    [ObservableProperty]
    private string _regexFilter = string.Empty;

    [ObservableProperty]
    private string _statusText = "选择设备后开始采集";

    [ObservableProperty]
    private bool _isCapturing;

    /// <summary>暂停中（界面冻结，缓冲继续）</summary>
    [ObservableProperty]
    private bool _isPaused;

    /// <summary>暂停可用性：仅在采集中</summary>
    public bool CanPause => IsCapturing;

    partial void OnIsCapturingChanged(bool value) => OnPropertyChanged(nameof(CanPause));

    /// <summary>级别过滤选项</summary>
    public IReadOnlyList<string> LevelOptions { get; } =
        ["全部", "V", "D", "I", "W", "E", "F"];

    public LogAnalyzerViewModel(
        LogcatCaptureService capture,
        IDeviceSessionHub hub,
        IAppPaths paths,
        IAppLog log,
        IUiDispatcher ui,
        IBackgroundTaskCenter tasks)
    {
        _capture = capture;
        _hub = hub;
        _paths = paths;
        _log = log;
        _ui = ui;
        _tasks = tasks;

        // 设备掉线 / 切换 → 自动停止采集
        _hub.ActiveDeviceChanged += () => _ui.Post(StopIfDeviceGone);
        _capture.CaptureStopped += () => _ui.Post(OnCaptureStopped);

        // 消费端节流：后台循环批量取行（100ms），编组回 UI 线程追加
        _ = DrainLoopAsync();
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

        _captureCts = new CancellationTokenSource();
        try
        {
            await _capture.StartAsync(device.Serial, _captureCts.Token);
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

            // 导出过滤后的缓冲快照（过滤逻辑与显示一致）
            var filtered = _capture.BufferSnapshot().Where(MatchesFilter).ToList();
            File.WriteAllLines(file, filtered.Select(l => l.Raw));
            StatusText = $"已导出 {filtered.Count} 行 → {file}";
        }
        catch (Exception ex)
        {
            _log.Error($"导出失败: {ex.Message}", LogAnalyzerModule.ModuleId);
            StatusText = $"导出失败: {ex.Message}";
        }
    }

    // ==================== 内部 ====================

    /// <summary>消费端节流循环：批量取行 → 过滤 → UI 追加（上限裁剪）</summary>
    private async Task DrainLoopAsync()
    {
        var batch = new List<LogcatLine>();
        var reader = _capture.Lines;

        while (await reader.WaitToReadAsync())
        {
            batch.Clear();
            while (reader.TryRead(out var line))
                batch.Add(line);
            if (batch.Count == 0)
                continue;

            var visible = batch.Where(MatchesFilter).ToList();
            if (visible.Count == 0)
                continue;

            _ui.Post(() =>
            {
                if (IsPaused)
                    return;
                foreach (var line in visible)
                {
                    VisibleLines.Add(line);
                    if (VisibleLines.Count > DisplayLimit)
                        VisibleLines.RemoveAt(0); // 显示上限裁剪（缓冲仍全量）
                }
            });
            await Task.Delay(BatchIntervalMs);
        }
    }

    /// <summary>过滤：级别 + tag 包含 + 正则（消费端，避免每行 UI 绑定）</summary>
    private bool MatchesFilter(LogcatLine line)
    {
        if (SelectedLevel != "全部" && line.Level != SelectedLevel)
            return false;
        if (!string.IsNullOrWhiteSpace(TagFilter) &&
            !(line.Tag?.Contains(TagFilter.Trim(), StringComparison.OrdinalIgnoreCase) ?? false))
            return false;
        if (!string.IsNullOrWhiteSpace(RegexFilter))
        {
            try
            {
                if (!Regex.IsMatch(line.Message, RegexFilter, RegexOptions.IgnoreCase))
                    return false;
            }
            catch
            {
                // 无效正则视为不过滤
            }
        }
        return true;
    }

    private void StopIfDeviceGone()
    {
        if (IsCapturing && _hub.ActiveDevice is null)
            StopCapture();
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
