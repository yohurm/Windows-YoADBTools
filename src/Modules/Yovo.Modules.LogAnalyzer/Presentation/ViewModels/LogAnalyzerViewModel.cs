using System.Collections.ObjectModel;
using System.IO;
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
/// 日志分析工作区主机（M1 F40）— 采集开关（设备级单流，ADR-LA-001）/ 会话 Tab 命令 /
/// 设备事件 / 消费端节流扇出到各会话。
/// 性能约束：消费端过滤；UI 100ms 批量节流 + 虚拟化；每会话显示上限裁剪（缓冲仍全量）。
/// 工具栏语义（设计文档 §5.5）：开始/停止=Device；暂停/清空/导出=当前焦点会话。
/// </summary>
public partial class LogAnalyzerViewModel : ObservableObject
{
    public const string DisplayLimitKey = "display.limit";
    public const string ClearDeviceOnStartKey = "clear.device.on.start";
    private const int DefaultDisplayLimit = 2000;
    private const int BatchIntervalMs = 100;

    private readonly DeviceCaptureService _capture;
    private readonly ProcessIndexService _index;
    private readonly LogWorkspace _workspace;
    private readonly IDeviceSessionHub _hub;
    private readonly IAppPaths _paths;
    private readonly IAppLog _log;
    private readonly IUiDispatcher _ui;
    private readonly IBackgroundTaskCenter _tasks;
    private readonly IAppLifecycle _lifecycle;
    private readonly ISettingsStore _settings;
    private readonly IAdbCommandExecutor _adb;
    private readonly int _displayLimit;
    private BackgroundTaskId? _taskId;
    private CancellationTokenSource? _captureCts;

    /// <summary>正在采集的设备（P1-1：焦点切换为其他设备时停采）</summary>
    private DeviceSerial? _captureSerial;

    /// <summary>会话视图模型（与 Workspace 会话一一对应，SessionsChanged 镜像）</summary>
    public ObservableCollection<LogSessionViewModel> SessionViewModels { get; } = [];

    /// <summary>当前焦点会话（TabControl SelectedItem 双向绑定）</summary>
    [ObservableProperty]
    private LogSessionViewModel? _activeSession;

    partial void OnActiveSessionChanged(LogSessionViewModel? value)
    {
        if (value is not null)
            _workspace.Select(value.Session.Id); // 域层焦点跟随（幂等）
    }

    [ObservableProperty]
    private string _statusText = "选择设备后开始采集";

    [ObservableProperty]
    private bool _isCapturing;

    /// <summary>缓冲行数（状态栏）</summary>
    [ObservableProperty]
    private int _bufferCount;

    /// <summary>进程索引状态（状态栏：「N s 前更新」/「不可用」）</summary>
    [ObservableProperty]
    private string _processIndexStatus = string.Empty;

    /// <summary>暂停可用性：仅在采集中（暂停作用于当前焦点会话）</summary>
    public bool CanPause => IsCapturing;

    /// <summary>清设备缓冲可用性：有焦点设备</summary>
    public bool CanClearDeviceBuffer => _hub.ActiveDevice is not null;

    partial void OnIsCapturingChanged(bool value)
    {
        OnPropertyChanged(nameof(CanPause));
        UpdateStatus();
    }

    /// <summary>会话标题重命名输入回调（View 注入；null = 跳过）</summary>
    public Func<LogSession, string>? PromptSessionTitle { get; set; }

    /// <summary>按包名开窗输入回调（View 注入进程选择对话框；null = 跳过）</summary>
    public Func<string>? PromptPackageName { get; set; }

    /// <summary>按 PID 开窗输入回调（View 注入数字输入对话框；null = 跳过）</summary>
    public Func<string>? PromptPidName { get; set; }

    /// <summary>进程快照（按包名开窗对话框用）</summary>
    public IReadOnlyList<ProcessEntry> ProcessEntries => _index.Snapshot;

    public LogAnalyzerViewModel(
        DeviceCaptureService capture,
        ProcessIndexService index,
        LogWorkspace workspace,
        IDeviceSessionHub hub,
        IAppPaths paths,
        IAppLog log,
        IUiDispatcher ui,
        IBackgroundTaskCenter tasks,
        IAppLifecycle lifecycle,
        ISettingsStore settings,
        IAdbCommandExecutor adb)
    {
        _capture = capture;
        _index = index;
        _workspace = workspace;
        _hub = hub;
        _paths = paths;
        _log = log;
        _ui = ui;
        _tasks = tasks;
        _lifecycle = lifecycle;
        _settings = settings;
        _adb = adb;
        _displayLimit = Math.Clamp(
            _settings.Get(SettingsScope.Module(LogAnalyzerModule.ModuleId), DisplayLimitKey, DefaultDisplayLimit),
            500, 50_000);

        // 工作区事件 → 镜像会话集合 / PID 重绑重放
        _workspace.SessionsChanged += () => _ui.Post(SyncSessions);
        _workspace.PidSetChanged += () => _ui.Post(() =>
        {
            foreach (var svm in SessionViewModels)
            {
                svm.Replay(); // 重绑仅当集合变化（轻量重放）
                OnPropertyChanged(nameof(BufferCount));
            }
            UpdateStatus();
        });

        // 设备掉线 / 切换 → 自动停止采集 + 清缓冲（避免串设备）
        _hub.ActiveDeviceChanged += () => _ui.Post(OnDeviceChanged);
        _capture.CaptureStopped += () => _ui.Post(OnCaptureStopped);

        // 进程索引刷新 → 会话 PID 重绑 + 包名下拉刷新
        _index.Changed += () => _ui.Post(OnIndexChanged);

        // 首次进入模块（§8.1）：无会话 → 创建默认 All
        _workspace.EnsureDefault();
        SyncSessions();

        // 消费端节流：后台循环批量取行（100ms），编组回 UI 线程扇出到各会话
        _ = DrainLoopAsync();
    }

    // ==================== 采集控制（Device 级，§5.5） ====================

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
            _index.Start(device.Serial); // F41：采集中周期刷新进程索引
            // 后台任务：每设备一条（ADR-LA-001 单流）
            _taskId = _tasks.Register(new BackgroundTaskDescriptor(
                "logcat 采集", LogAnalyzerModule.ModuleId,
                Detail: device.DisplayName));
            UpdateTaskDetail(device);
            UpdateStatus();
        }
        catch (Exception ex)
        {
            _log.Error($"启动采集失败: {ex.Message}", LogAnalyzerModule.ModuleId);
            StatusText = $"启动失败: {ex.Message}";
        }
    }

    /// <summary>清空设备 log 缓冲（F22：Device 级）— 同时清共享缓冲并重建各会话可见区</summary>
    [RelayCommand(CanExecute = nameof(CanClearDeviceBuffer))]
    private async Task ClearDeviceBufferAsync()
    {
        if (_hub.ActiveDevice is not { } device)
            return;
        try
        {
            StatusText = "正在清空设备 log 缓冲…";
            await _adb.ExecuteAsync(device.Serial, "logcat -c", TimeSpan.FromSeconds(10), _lifecycle.ShutdownToken);
            _capture.ClearBuffer();
            BufferCount = 0;
            foreach (var svm in SessionViewModels)
                svm.ClearVisible();
            StatusText = "已清空设备 log 缓冲（共享缓冲与会话可见区）";
        }
        catch (Exception ex)
        {
            _log.Error($"清空设备缓冲失败: {ex.Message}", LogAnalyzerModule.ModuleId);
            StatusText = $"清空失败: {ex.Message}";
        }
    }

    // ==================== 会话命令（工具栏作用于焦点会话） ====================

    [RelayCommand(CanExecute = nameof(CanPause))]
    private void Pause() => ActiveSession?.TogglePauseCommand.Execute(null);

    /// <summary>清空当前焦点会话可见区（共享缓冲保留 — §5.4）</summary>
    [RelayCommand]
    private void Clear() => ActiveSession?.ClearVisible();

    /// <summary>导出当前焦点会话过滤后的缓冲快照为 txt（F32 移除后唯一导出）</summary>
    [RelayCommand]
    private void Export()
    {
        if (ActiveSession is not { } session)
            return;
        try
        {
            var exportDir = Path.Combine(_paths.ModuleData(LogAnalyzerModule.ModuleId), "exports");
            var file = session.Export(_capture.BufferSnapshot(), exportDir);
            StatusText = $"已导出当前会话 → {file}";
        }
        catch (Exception ex)
        {
            _log.Error($"导出失败: {ex.Message}", LogAnalyzerModule.ModuleId);
            StatusText = $"导出失败: {ex.Message}";
        }
    }

    // ==================== 会话 Tab 命令（M1 F40/F41/F42） ====================

    [RelayCommand]
    private void AddAllSession()
    {
        var session = _workspace.Add(SessionScope.All);
        StatusText = $"已新建会话: {session.Title}";
        SyncSessions();
    }

    [RelayCommand]
    private void AddPackageSession(string? package)
    {
        if (string.IsNullOrWhiteSpace(package))
            return;
        var session = _workspace.Add(SessionScope.Package, packageName: package.Trim());
        StatusText = $"已按包名新建会话: {session.Title}";
        SyncSessions();
    }

    /// <summary>按包名开窗（交互式：View 注入进程选择对话框；命令化便于菜单/自动化调用）</summary>
    [RelayCommand]
    private void AddPackageSessionInteractive()
    {
        if (PromptPackageName is not { } prompt)
            return;
        var package = prompt();
        if (!string.IsNullOrWhiteSpace(package))
            AddPackageSession(package);
    }

    [RelayCommand]
    private void AddPidSession(string? pid)
    {
        if (string.IsNullOrWhiteSpace(pid) || !pid.Trim().All(char.IsAsciiDigit))
        {
            StatusText = "PID 仅支持数字";
            return;
        }
        var session = _workspace.Add(SessionScope.Pid, exactPid: pid.Trim());
        StatusText = $"已按 PID 新建会话: {session.Title}";
        SyncSessions();
    }

    /// <summary>按 PID 开窗（交互式：View 注入数字输入对话框）</summary>
    [RelayCommand]
    private void AddPidSessionInteractive()
    {
        if (PromptPidName is not { } prompt)
            return;
        var pid = prompt();
        if (!string.IsNullOrWhiteSpace(pid))
            AddPidSession(pid);
    }

    [RelayCommand]
    private void CloseSession(string? id)
    {
        if (id is null || !_workspace.Close(id))
            return;
        SyncSessions();
        UpdateTaskDetail(_hub.ActiveDevice);
    }

    /// <summary>重命名会话标题（View 注入输入框；M1 §7.2 可重命名）</summary>
    [RelayCommand]
    private void RenameSession(LogSession? session)
    {
        if (session is null || PromptSessionTitle is not { } prompt)
            return;
        var title = prompt(session);
        if (string.IsNullOrWhiteSpace(title))
            return;
        session.Title = title.Trim();
        StatusText = $"会话已重命名: {session.Title}";
    }

    // ==================== 内部 ====================

    /// <summary>工作区会话集合 → 会话 VM 镜像（增删/焦点变化后同步）</summary>
    private void SyncSessions()
    {
        // 移除已关闭会话
        for (var i = SessionViewModels.Count - 1; i >= 0; i--)
        {
            if (_workspace.Sessions.All(s => s.Id != SessionViewModels[i].Session.Id))
                SessionViewModels.RemoveAt(i);
        }
        // 补充新增会话（显示上限 = 模块设置）
        foreach (var session in _workspace.Sessions)
        {
            if (SessionViewModels.All(v => v.Session.Id != session.Id))
            {
                SessionViewModels.Add(new LogSessionViewModel(
                    session, _index, () => _capture.BufferSnapshot(), _displayLimit));
            }
        }
        // 焦点跟随
        var active = SessionViewModels.FirstOrDefault(v => v.Session.Id == _workspace.ActiveSession?.Id)
                     ?? SessionViewModels.FirstOrDefault();
        if (!ReferenceEquals(ActiveSession, active))
            ActiveSession = active;
        UpdateTaskDetail(_hub.ActiveDevice);
    }

    /// <summary>后台任务明细：设备名 + 会话数（如 "3 sessions"）</summary>
    private void UpdateTaskDetail(AdbDevice? device)
    {
        if (_taskId is not { } id || device is null)
            return;
        var count = SessionViewModels.Count;
        _tasks.Update(id, BackgroundTaskState.Running,
            detail: count > 1 ? $"{device.DisplayName} · {count} sessions" : device.DisplayName);
    }

    /// <summary>进程索引刷新 → 包名会话 PID 重绑 + 包名下拉刷新</summary>
    private void OnIndexChanged()
    {
        _workspace.RefreshPidSets(_index);
        foreach (var svm in SessionViewModels)
            svm.RefreshPackageOptions();
        UpdateStatus();
    }

    /// <summary>状态栏合成（§7.4：采集/缓冲/可见/信号/索引年龄）</summary>
    private void UpdateStatus()
    {
        if (!IsCapturing)
            return; // 停止状态由各操作命令写入文案
        var device = _hub.ActiveDevice?.DisplayName ?? "未知设备";
        var active = ActiveSession;
        var visible = active?.VisibleLines.Count ?? 0;
        var signals = active?.SignalCount ?? 0;
        var indexAge = _index.LastUpdatedUtc is { } last
            ? $"{(int)(DateTimeOffset.Now - last).TotalSeconds}s 前更新"
            : "索引更新中";
        if (!_index.IsAvailable)
            indexAge = "不可用（仅 PID 模式）";
        StatusText = $"正在采集 {device} · 缓冲 {BufferCount} · 可见 {visible} · 信号 {signals} · 索引 {indexAge}";
    }

    /// <summary>
    /// 焦点变化（P1-1/§5.4）：焦点清空或切换为其他设备 → 停采（如采集中）+ 清共享缓冲
    /// （避免串设备）+ 各会话可见区清空；会话配置保留（过滤条件不丢）。
    /// 同一设备的重列事件（serial 不变）不动作，保留停止后的缓冲供过滤重放。
    /// </summary>
    private void OnDeviceChanged()
    {
        var active = _hub.ActiveDevice;
        if (active?.Serial == _captureSerial)
            return;

        var wasCapturing = IsCapturing;
        if (wasCapturing)
            StopCapture();
        _capture.ClearBuffer();
        BufferCount = 0;
        _workspace.BindDevice(active?.Serial); // 强制清 PID 追踪（ADR：设备切换强制清空）
        foreach (var svm in SessionViewModels)
            svm.ReplayFrom([]); // 清可见区（保留会话配置）
        StatusText = active is null
            ? wasCapturing ? "设备已掉线，采集已停止，缓冲已清空" : "设备已掉线"
            : wasCapturing
                ? $"设备已切换，采集已停止（当前: {active.DisplayName}）"
                : $"设备已切换（当前: {active.DisplayName}）";
    }

    private void StopCapture()
    {
        _capture.Stop();
        _index.Stop();
        _captureCts?.Cancel();
        if (_taskId is { } id)
            _tasks.Complete(id, BackgroundTaskCompletion.Canceled);
        _taskId = null;
        // 主动停止：立即更新 UI（CaptureStopped 事件仅意外退出路径触发 — Stop 已清世代，finally 不误伤）
        IsCapturing = false;
    }

    private void OnCaptureStopped()
    {
        _index.Stop();
        IsCapturing = false;
        if (_taskId is { } id)
            _tasks.Complete(id, BackgroundTaskCompletion.Failed);
        _taskId = null;
        StatusText = "采集已停止";
    }

    /// <summary>
    /// 消费端节流循环：循环取当前世代行流 → 批量 → UI 扇出到各未暂停会话（ADR-LA-001 单流多视图）。
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

                var snapshot = batch.ToList();
                _ui.Post(() =>
                {
                    foreach (var svm in SessionViewModels)
                        svm.AppendBatch(snapshot);
                    BufferCount = _capture.BufferCount;
                    UpdateStatus();
                });
                await Task.Delay(BatchIntervalMs);
            }

            // 当前世代关闭：停止（正常）或进程意外结束——短暂等待后取新世代（等待重新开始）
            await Task.Delay(200);
        }
    }
}
