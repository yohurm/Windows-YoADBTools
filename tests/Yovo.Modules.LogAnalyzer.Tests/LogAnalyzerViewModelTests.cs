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

/// <summary>日志分析 VM：过滤重放（F27）/ 预设应用（F31）/ 信号计数（F26）</summary>
public class LogAnalyzerViewModelTests
{
    private static readonly DeviceSerial Serial = new("V2361A");

    private static LogcatLine Line(string level, string tag, string message, string pid = "100")
        => new(DateTimeOffset.Now, pid, pid, level, tag, message, $"{level} {tag}: {message}");

    private sealed class FakeCapture : LogcatCaptureService
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

    [Fact]
    public void Filter_change_replays_buffer_to_visible_lines()
    {
        var capture = new FakeCapture();
        capture.Seed(
            Line("I", "ActivityManager", "Start proc 100"),
            Line("E", "AndroidRuntime", "FATAL EXCEPTION: main"),
            Line("W", "SystemServer", "warning here"),
            Line("I", "ActivityManager", "second start"));

        var vm = CreateVm(capture);
        Assert.Equal(4, capture.BufferSnapshot().Count);

        // 关键字过滤 → 重放缓冲（F27）
        vm.KeywordFilter = "ActivityManager";
        Assert.All(vm.VisibleLines, d => Assert.Contains("ActivityManager", d.Primary.Tag));

        // 级别过滤叠加：仅 E 以上
        vm.KeywordFilter = string.Empty;
        vm.SelectedLevel = "E";
        Assert.All(vm.VisibleLines, d => Assert.Equal("E", d.Primary.Level));

        // 清空过滤 → 全量
        vm.SelectedLevel = "全部";
        Assert.Equal(4, vm.VisibleLines.Count);
    }

    [Fact]
    public void Preset_apply_sets_all_filters_and_replays()
    {
        var capture = new FakeCapture();
        capture.Seed(Line("E", "AndroidRuntime", "FATAL EXCEPTION: main"), Line("I", "Other", "noise"));
        var vm = CreateVm(capture);

        // 模拟 View 注入预设名输入 + 保存
        vm.PromptPresetName = () => "崩溃";
        vm.SelectedLevel = "W";
        vm.TagFilter = "AndroidRuntime";
        vm.SavePresetCommand.Execute(null);

        Assert.Single(vm.Presets);
        Assert.Equal("崩溃", vm.Presets[0].Name);

        // 清除过滤再应用预设 → 恢复过滤条件并重放
        vm.SelectedLevel = "全部";
        vm.TagFilter = string.Empty;
        vm.SelectedPreset = null; // 先清除（同实例重选不触发 partial）
        vm.SelectedPreset = vm.Presets[0];

        Assert.Equal("W", vm.SelectedLevel);
        Assert.Equal("AndroidRuntime", vm.TagFilter);
        Assert.All(vm.VisibleLines, d => Assert.Equal("AndroidRuntime", d.Primary.Tag));
    }

    [Fact]
    public void Signal_count_tracks_visible_lines()
    {
        var capture = new FakeCapture();
        capture.Seed(
            Line("E", "AndroidRuntime", "FATAL EXCEPTION: main"),
            Line("E", "AndroidRuntime", "Process: com.example, PID: 1"),
            Line("I", "SystemServer", "normal"));
        var vm = CreateVm(capture);

        vm.SelectedLevel = "E"; // 触发重放 → 信号计数
        Assert.Equal(1, vm.SignalCount); // 仅 FATAL EXCEPTION 行是信号（Process 行不算）
    }

    // ==================== 测试支撑 ====================

    private static LogAnalyzerViewModel CreateVm(FakeCapture capture)
        => new(
            capture,
            new FakeHub(),
            new FakePaths(),
            new SilentLog(),
            new FakeDispatcher(),
            new FakeTasks(),
            new FakeLifecycle(),
            new InMemorySettings(),
            new FakeAdb(),
            new LogPresetStore(new FakePaths()));

    private sealed class FakeHub : IDeviceSessionHub
    {
        public AdbDevice? ActiveDevice => new(Serial, "device", "V2361A");
        public event Action? ActiveDeviceChanged;
        public event Action<string>? SelectionChanged;
        public void SetActiveDevice(DeviceSerial? serial) { }
        public void SetModuleMode(string moduleId, DeviceSelectionMode mode) { }
        public DeviceSelection GetSelection(string moduleId) => DeviceSelection.Empty(DeviceSelectionMode.SingleRequired);
        public void SetSelection(string moduleId, DeviceSelection selection) { }
    }

    private sealed class FakeStreaming : IAdbStreamingExecutor
    {
        public Task<IStreamingProcess> ExecuteStreamingAsync(DeviceSerial? serial, string adbArgs, CancellationToken ct = default)
            => throw new NotSupportedException();
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
        public IReadOnlyList<BackgroundTaskSnapshot> Active => [];
        public event Action? Changed;
        public BackgroundTaskId Register(BackgroundTaskDescriptor descriptor) => new(Guid.NewGuid().ToString("N"));
        public void Update(BackgroundTaskId id, BackgroundTaskState state, string? detail = null, double? progressPercent = null) { }
        public void Complete(BackgroundTaskId id, BackgroundTaskCompletion completion) { }
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

    private sealed class FakeAdb : IAdbCommandExecutor
    {
        public Task<AdbTextResult> ExecuteAsync(DeviceSerial? serial, string adbArgs, TimeSpan? timeout = null, CancellationToken ct = default)
            => Task.FromResult(new AdbTextResult("", "", 0, 0));
    }

    private sealed class FakePaths : IAppPaths
    {
        public string SettingsRoot => ".";
        public string DataRoot => ".";
        public string ToolsRoot => ".";
        public string CacheRoot => ".";
        public string TempRoot => ".";
        public string ModuleData(string moduleId) => ".";
        public string ModuleConfig(string moduleId) => ".";
    }
}
