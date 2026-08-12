using System.Collections.ObjectModel;
using Yovo.Modules.LogAnalyzer.Application;
using Yovo.Modules.LogAnalyzer.Presentation.ViewModels;
using Yovo.Platform.Abstractions;
using Yovo.Platform.Abstractions.Adb;
using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Logging;
using Yovo.Platform.Abstractions.Process;
using Yovo.Platform.Abstractions.Settings;
using Yovo.Platform.Abstractions.Tasks;
using Xunit;

namespace Yovo.Modules.LogAnalyzer.Tests;

/// <summary>工作区主机 VM：默认会话 / Tab 命令 / 设备切换清缓冲 / 后台任务 / 导出仅当前会话</summary>
public class LogAnalyzerViewModelTests
{
    private static readonly DeviceSerial SerialA = new("V2361A");
    private static readonly DeviceSerial SerialB = new("V9999");

    private static LogcatLine Line(string level, string tag, string message, string? pid = "100")
        => new(DateTimeOffset.Now, pid, pid, level, tag, message, $"{level} {tag}: {message}");

    /// <summary>可注入缓冲的采集替身（virtual BufferSnapshot 同模式）</summary>
    private sealed class FakeCapture : DeviceCaptureService
    {
        private readonly List<LogcatLine> _buffer = [];

        public FakeCapture() : base(new FakeStreaming(), new SilentLog())
        {
        }

        public void Seed(params LogcatLine[] lines)
        {
            _buffer.Clear();
            _buffer.AddRange(lines);
        }

        public override IReadOnlyList<LogcatLine> BufferSnapshot() => _buffer.ToList();
    }

    /// <summary>可换快照的进程索引（可手动触发变更通知）</summary>
    private sealed class FakeIndex : ProcessIndexService
    {
        private ProcessEntry[] _entries;

        public FakeIndex(ProcessEntry[]? entries = null) : base(new NoopAdb(), new SilentLog())
            => _entries = entries ?? [];

        public override IReadOnlyList<ProcessEntry> Snapshot => _entries;

        /// <summary>模拟进程索引刷新后的新快照</summary>
        public void SetEntries(params ProcessEntry[] entries) => _entries = entries;

        public void RaiseChanged() => NotifyChanged();
    }

    [Fact]
    public void Ctor_creates_default_all_session()
    {
        var vm = CreateVm();

        Assert.Single(vm.SessionViewModels);
        Assert.NotNull(vm.ActiveSession);
        Assert.Equal("全部日志", vm.ActiveSession.Session.Title);
    }

    [Fact]
    public void Add_sessions_creates_tabs_and_focuses_new_one()
    {
        var vm = CreateVm();
        var initial = vm.ActiveSession;

        vm.AddAllSessionCommand.Execute(null);
        vm.AddPackageSessionCommand.Execute("com.example.app");
        vm.AddPidSessionCommand.Execute("123");

        Assert.Equal(4, vm.SessionViewModels.Count);
        Assert.Equal(SessionScope.Pid, vm.ActiveSession?.Session.Scope);
        Assert.NotSame(initial, vm.ActiveSession);

        // 包名会话立即绑定索引快照（§8.2）
        var pkg = vm.SessionViewModels.First(v => v.Session.Scope == SessionScope.Package);
        Assert.Equal(["100"], pkg.Session.PidSet);
    }

    [Fact]
    public void Close_active_tab_focuses_neighbor()
    {
        var vm = CreateVm();
        vm.AddAllSessionCommand.Execute(null);
        var second = vm.ActiveSession;
        vm.AddPidSessionCommand.Execute("123");
        var third = vm.ActiveSession;

        vm.CloseSessionCommand.Execute(third.Session.Id);

        Assert.Equal(2, vm.SessionViewModels.Count);
        Assert.Same(second, vm.ActiveSession);
    }

    [Fact]
    public void Close_last_tab_rebuilds_default_all()
    {
        var vm = CreateVm();
        var only = vm.ActiveSession!;

        vm.CloseSessionCommand.Execute(only.Session.Id);

        Assert.Single(vm.SessionViewModels);
        Assert.Equal(SessionScope.All, vm.ActiveSession?.Session.Scope);
        Assert.NotEqual(only.Session.Id, vm.ActiveSession?.Session.Id); // 新建默认
    }

    [Fact]
    public void Add_pid_rejects_non_digit()
    {
        var vm = CreateVm();

        vm.AddPidSessionCommand.Execute("abc");

        Assert.Single(vm.SessionViewModels);
        Assert.Contains("数字", vm.StatusText);
    }

    [Fact]
    public void Interactive_commands_use_injected_prompts()
    {
        // 菜单项命令化（InvokePattern 可靠路径）：View 注入输入回调 → VM 创建对应作用域会话
        var vm = CreateVm();
        vm.PromptPackageName = () => "com.ggec.hs01";
        vm.PromptPidName = () => "12345";

        vm.AddPackageSessionInteractiveCommand.Execute(null);
        vm.AddPidSessionInteractiveCommand.Execute(null);

        Assert.Equal(3, vm.SessionViewModels.Count);
        Assert.Equal(SessionScope.Package, vm.SessionViewModels[1].Session.Scope);
        Assert.Equal("com.ggec.hs01", vm.SessionViewModels[1].Session.PackageName);
        Assert.Equal(SessionScope.Pid, vm.SessionViewModels[2].Session.Scope);
        Assert.Equal("12345", vm.SessionViewModels[2].Session.ExactPid);

        // 未注入回调（测试/无 View）：no-op
        var vm2 = CreateVm();
        vm2.AddPackageSessionInteractiveCommand.Execute(null);
        vm2.AddPidSessionInteractiveCommand.Execute(null);
        Assert.Single(vm2.SessionViewModels);
    }

    [Fact]
    public void Device_switch_stops_capture_and_clears_buffer_and_visible()
    {
        var capture = new FakeCapture();
        var hub = new FakeHub { Current = new AdbDevice(SerialA, "device", "V2361A") };
        var vm = CreateVm(capture: capture, hub: hub);
        vm.ActiveSession!.ReplayFrom([Line("I", "T", "from A")]);
        Assert.Single(vm.ActiveSession.VisibleLines);

        // 模拟焦点切换 → 停采 + 清缓冲 + 清可见（会话配置保留）
        hub.RaiseActiveDeviceChanged();

        Assert.False(vm.IsCapturing);
        Assert.Empty(vm.ActiveSession.VisibleLines);
        Assert.Empty(capture.BufferSnapshot());
        Assert.Equal("全部", vm.ActiveSession.SelectedLevel); // 过滤条件不丢
    }

    [Fact]
    public void Export_writes_only_active_session_filtered_lines()
    {
        var capture = new FakeCapture();
        capture.Seed(
            Line("E", "AndroidRuntime", "FATAL EXCEPTION: main"),
            Line("I", "ActivityManager", "noise"));
        var root = Path.Combine(Path.GetTempPath(), "yovo-host-export", Guid.NewGuid().ToString("N"));
        var vm = CreateVm(capture: capture, paths: new FakePaths(root));
        vm.ActiveSession!.SelectedLevel = "E";

        vm.ExportCommand.Execute(null);

        var exportDir = Path.Combine(root, "modules", "log-analyzer", "exports");
        var file = Directory.GetFiles(exportDir).Single();
        var lines = File.ReadAllLines(file);
        Assert.Single(lines);
        Assert.Contains("FATAL EXCEPTION", lines[0]);
        Directory.Delete(root, recursive: true);
    }

    [Fact]
    public async Task Capture_start_registers_single_background_task_with_session_detail()
    {
        var tasks = new FakeTasks();
        var vm = CreateVm(tasks: tasks);
        vm.AddAllSessionCommand.Execute(null);
        vm.AddAllSessionCommand.Execute(null); // 3 个会话

        // ExecuteAsync（await）避免 AsyncRelayCommand 并发守卫吞掉第二次 Execute 的竞态
        await vm.ToggleCaptureCommand.ExecuteAsync(null);

        Assert.True(vm.IsCapturing);
        Assert.Single(tasks.Registered);
        Assert.Contains("3 sessions", tasks.Updates[0].detail); // 会话数入后台任务明细

        await vm.ToggleCaptureCommand.ExecuteAsync(null); // 停止 → 任务完结
        Assert.False(vm.IsCapturing);
        Assert.Equal(BackgroundTaskCompletion.Canceled, tasks.LastCompletion);
    }

    [Fact]
    public void Pause_acts_on_active_session_only()
    {
        var vm = CreateVm();
        vm.AddAllSessionCommand.Execute(null);
        var second = vm.ActiveSession!;
        vm.AddPidSessionCommand.Execute("123");
        var third = vm.ActiveSession!;
        vm.ActiveSession = second; // 焦点回第二个
        Assert.Same(second, vm.ActiveSession);

        vm.PauseCommand.Execute(null);

        Assert.True(second.IsPaused);
        Assert.False(third.IsPaused); // 其他会话不冻结
    }

    [Fact]
    public void Clear_acts_on_active_session_visible_only()
    {
        var capture = new FakeCapture();
        capture.Seed(Line("I", "T", "line"));
        var vm = CreateVm(capture: capture);
        vm.AddAllSessionCommand.Execute(null);
        vm.ActiveSession!.ReplayFrom(capture.BufferSnapshot());
        Assert.Single(vm.ActiveSession.VisibleLines);

        vm.ClearCommand.Execute(null);

        Assert.Empty(vm.ActiveSession.VisibleLines);
        Assert.Single(capture.BufferSnapshot()); // 共享缓冲保留
    }

    [Fact]
    public void Index_change_rebinds_package_sessions_and_replays()
    {
        var capture = new FakeCapture();
        capture.Seed(Line("I", "T", "old pid line", pid: "100"), Line("I", "T", "new pid line", pid: "500"));
        var hub = new FakeHub { Current = new AdbDevice(SerialA, "device", "V2361A") };
        var index = new FakeIndex([new("100", "com.example.app", DateTimeOffset.Now)]);
        var vm = CreateVm(capture: capture, hub: hub, index: index);

        // 初始索引 {100} → 包名会话显示旧行
        var pkg = AddPackage(vm, "com.example.app");
        Assert.Single(pkg.VisibleLines);
        Assert.Equal("100", pkg.VisibleLines[0].Primary.Pid);

        // 索引刷新：包名重绑到 500（模拟重启）→ 轻量重放
        index.SetEntries(new ProcessEntry("500", "com.example.app", DateTimeOffset.Now));
        index.RaiseChanged();

        Assert.Equal(2, pkg.VisibleLines.Count); // 历史 100 + 新绑定 500
        Assert.Contains(pkg.VisibleLines, d => d.Primary.Pid == "500");
    }

    // ==================== 测试支撑 ====================

    private static LogAnalyzerViewModel CreateVm(
        FakeCapture? capture = null,
        FakeHub? hub = null,
        FakeTasks? tasks = null,
        FakeIndex? index = null,
        FakePaths? paths = null)
        => new(
            capture ?? new FakeCapture(),
            index ?? new FakeIndex([new("100", "com.example.app", DateTimeOffset.Now)]),
            new LogWorkspace(),
            hub ?? new FakeHub { Current = new AdbDevice(SerialA, "device", "V2361A") },
            paths ?? new FakePaths("."),
            new SilentLog(),
            new FakeDispatcher(),
            tasks ?? new FakeTasks(),
            new FakeLifecycle(),
            new InMemorySettings(),
            new NoopAdb());

    /// <summary>执行按包名开窗并返回新增会话 VM（工作区事件同步）</summary>
    private static LogSessionViewModel AddPackage(LogAnalyzerViewModel vm, string package)
    {
        vm.AddPackageSessionCommand.Execute(package);
        return vm.ActiveSession!;
    }

    private sealed class FakeHub : IDeviceSessionHub
    {
        public AdbDevice? Current { get; set; }

        public AdbDevice? ActiveDevice => Current;
        public event Action? ActiveDeviceChanged;
        public event Action<string>? SelectionChanged;
        public void SetActiveDevice(DeviceSerial? serial) { }
        public void SetModuleMode(string moduleId, DeviceSelectionMode mode) { }
        public DeviceSelection GetSelection(string moduleId) => DeviceSelection.Empty(DeviceSelectionMode.SingleRequired);
        public void SetSelection(string moduleId, DeviceSelection selection) { }

        public void RaiseActiveDeviceChanged() => ActiveDeviceChanged?.Invoke();
    }

    /// <summary>永续输出流（模拟持续采集；Kill 才结束）</summary>
    private sealed class FakeStreaming : IAdbStreamingExecutor
    {
        private readonly FakeProcess _process = new();

        public Task<IStreamingProcess> ExecuteStreamingAsync(DeviceSerial? serial, string adbArgs, CancellationToken ct = default)
            => Task.FromResult<IStreamingProcess>(_process);
    }

    private sealed class FakeProcess : IStreamingProcess
    {
        private readonly TaskCompletionSource _never = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public IAsyncEnumerable<ProcessOutputChunk> Output => NeverEnding();

        private async IAsyncEnumerable<ProcessOutputChunk> NeverEnding()
        {
            await _never.Task; // 永不完成（保持世代存活）
            yield break;
        }

        public Task<int> WaitForExitAsync(CancellationToken ct = default)
            => _never.Task.ContinueWith(_ => 0);

        public void Kill() => _never.TrySetResult();

        public ValueTask DisposeAsync()
        {
            _never.TrySetResult();
            return ValueTask.CompletedTask;
        }
    }

    private sealed class SilentLog : IAppLog
    {
        public void Write(AppLogLevel level, string message, string source = "", IReadOnlyDictionary<string, string>? tags = null) { }
        public void Info(string message, string source = "", IReadOnlyDictionary<string, string>? tags = null) { }
        public void Warn(string message, string source = "", IReadOnlyDictionary<string, string>? tags = null) { }
        public void Error(string message, string source = "", IReadOnlyDictionary<string, string>? tags = null) { }
        public IDisposable Subscribe(AppLogFilter? filter, Action<AppLogEntry> handler) => new Noop();
        public IReadOnlyList<AppLogEntry> Snapshot(AppLogFilter? filter = null, int max = 2000) => [];
        private sealed class Noop : IDisposable { public void Dispose() { } }
    }

    private sealed class FakeDispatcher : IUiDispatcher
    {
        public bool IsOnUiThread => true;
        public void Post(Action action) => action();
        public Task InvokeAsync(Action action) { action(); return Task.CompletedTask; }
        public Task<T> InvokeAsync<T>(Func<T> func) => Task.FromResult(func());
    }

    private sealed class FakeTasks : IBackgroundTaskCenter
    {
        public List<(BackgroundTaskId id, string detail)> Registered { get; } = [];
        public List<(BackgroundTaskId id, string? detail)> Updates { get; } = [];
        public IReadOnlyList<BackgroundTaskSnapshot> Active => [];
        public event Action? Changed;
        public BackgroundTaskCompletion? LastCompletion { get; private set; }

        public BackgroundTaskId Register(BackgroundTaskDescriptor descriptor)
        {
            Registered.Add((new BackgroundTaskId(Guid.NewGuid().ToString("N")), descriptor.Detail));
            return Registered[^1].id;
        }

        public void Update(BackgroundTaskId id, BackgroundTaskState state, string? detail = null, double? progressPercent = null)
            => Updates.Add((id, detail));

        public void Complete(BackgroundTaskId id, BackgroundTaskCompletion completion) => LastCompletion = completion;
    }

    private sealed class FakeLifecycle : IAppLifecycle
    {
        public CancellationToken ShutdownToken => CancellationToken.None;
    }

    private sealed class InMemorySettings : ISettingsStore
    {
        private readonly Dictionary<string, string> _values = [];

        public T Get<T>(SettingsScope scope, string key, T defaultValue)
            => _values.TryGetValue($"{scope}:{key}", out var json)
                ? System.Text.Json.JsonSerializer.Deserialize<T>(json) ?? defaultValue
                : defaultValue;

        public void Set<T>(SettingsScope scope, string key, T value)
            => _values[$"{scope}:{key}"] = System.Text.Json.JsonSerializer.Serialize(value);

        public IObservable<SettingsChanged> Watch(SettingsScope scope, string? key = null) => new NoopObservable();
        public void Migrate(SettingsScope scope, int fromVersion, int toVersion, Action<ISettingsMigration> migrate) { }

        private sealed class NoopObservable : IObservable<SettingsChanged>
        {
            public IDisposable Subscribe(IObserver<SettingsChanged> observer) => new Noop();
            private sealed class Noop : IDisposable { public void Dispose() { } }
        }
    }

    private sealed class NoopAdb : IAdbCommandExecutor
    {
        public Task<AdbTextResult> ExecuteAsync(DeviceSerial? serial, string adbArgs, TimeSpan? timeout = null, CancellationToken ct = default)
            => Task.FromResult(new AdbTextResult("", "", 0, 0));
    }

    private sealed class FakePaths(string root) : IAppPaths
    {
        public string SettingsRoot => root;
        public string DataRoot => root;
        public string ToolsRoot => root;
        public string CacheRoot => root;
        public string TempRoot => root;
        public string ModuleData(string moduleId) => Path.Combine(root, "modules", moduleId);
        public string ModuleConfig(string moduleId) => Path.Combine(ModuleData(moduleId), "config");
    }
}
