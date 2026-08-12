using Yovo.Modules.LogAnalyzer.Application;
using Yovo.Modules.LogAnalyzer.Presentation.ViewModels;
using Yovo.Platform.Abstractions.Adb;
using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Logging;
using Xunit;

namespace Yovo.Modules.LogAnalyzer.Tests;

/// <summary>会话 VM：过滤重放 / 作用域互斥（§4.2）/ 追加与暂停 / 信号计数 / 导出</summary>
public class LogSessionViewModelTests
{
    private static LogcatLine Line(string level, string tag, string message, string? pid = "100")
        => new(DateTimeOffset.Now, pid, pid, level, tag, message, $"{level} {tag}: {message}");

    private static readonly ProcessEntry[] Processes =
    [
        new("100", "com.example.app", DateTimeOffset.Now),
        new("101", "com.example.app:push", DateTimeOffset.Now),
        new("200", "com.other", DateTimeOffset.Now),
    ];

    /// <summary>固定快照的进程索引（virtual Snapshot 替身）</summary>
    private sealed class FakeIndex : ProcessIndexService
    {
        public FakeIndex() : base(new NoopAdb(), new NoopLog())
        {
        }

        public override IReadOnlyList<ProcessEntry> Snapshot => Processes;
    }

    /// <summary>测试支撑：缓冲提供者（模拟采集缓冲）</summary>
    private sealed class TestSessionVm
    {
        public List<LogcatLine> Buffer { get; } = [];

        public LogSessionViewModel Create(SessionScope scope = SessionScope.All,
            string? packageName = null, string? exactPid = null)
        {
            var session = new LogSession("s1", scope, packageName, exactPid);
            var vm = new LogSessionViewModel(session, new FakeIndex(), () => Buffer, 2000);
            return vm;
        }
    }

    [Fact]
    public void Filter_change_replays_buffer_to_visible_lines()
    {
        var t = new TestSessionVm();
        t.Buffer.AddRange(
        [
            Line("I", "ActivityManager", "Start proc 100"),
            Line("E", "AndroidRuntime", "FATAL EXCEPTION: main"),
            Line("W", "SystemServer", "warning here"),
            Line("I", "ActivityManager", "second start"),
        ]);
        var vm = t.Create();

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
    public void Pid_scope_filters_exactly()
    {
        var t = new TestSessionVm();
        t.Buffer.AddRange(
        [
            Line("I", "T", "pid 100 line", pid: "100"),
            Line("I", "T", "pid 1000 line", pid: "1000"),
            Line("I", "T", "pid 10 line", pid: "10"),
        ]);
        var vm = t.Create(scope: SessionScope.Pid, exactPid: "100");

        Assert.Single(vm.VisibleLines);
        Assert.Equal("100", vm.VisibleLines[0].Primary.Pid);
    }

    [Fact]
    public void Package_scope_uses_pid_set_from_index()
    {
        var t = new TestSessionVm();
        t.Buffer.AddRange(
        [
            Line("I", "T", "main", pid: "100"),
            Line("I", "T", "push", pid: "101"),
            Line("I", "T", "other", pid: "200"),
        ]);
        var vm = t.Create(scope: SessionScope.Package, packageName: "com.example.app");

        // 默认不含子进程（ADR-LA-008）：仅主进程 PID 100
        Assert.Single(vm.VisibleLines);
        Assert.Equal("100", vm.VisibleLines[0].Primary.Pid);

        // 开启「包含子进程」→ com.example.app:push 也纳入（前缀匹配）
        vm.IncludeChildProcesses = true;
        Assert.Equal(2, vm.VisibleLines.Count);
    }

    [Fact]
    public void Package_scope_history_keeps_rebound_pids()
    {
        // F43：应用重启后旧 PID 行仍留在时间线（HistoryPidSet）
        var t = new TestSessionVm();
        t.Buffer.AddRange(
        [
            Line("I", "T", "old", pid: "100"),
            Line("I", "T", "new", pid: "500"),
        ]);
        var vm = t.Create(scope: SessionScope.Package, packageName: "com.example.app");
        Assert.Single(vm.VisibleLines); // 初始绑定 {100}

        // 进程索引刷新：包名重绑到新 PID 500（模拟重启）
        var session = vm.Session;
        var changed = session.UpdatePidSet(new HashSet<string> { "500" });
        Assert.True(changed);
        vm.Replay();

        Assert.Equal(2, vm.VisibleLines.Count); // 100 仍在（历史），500 加入（绑定）
        Assert.Contains(vm.VisibleLines, d => d.Primary.Pid == "100");
        Assert.Contains(vm.VisibleLines, d => d.Primary.Pid == "500");
    }

    [Fact]
    public void Scope_mutual_exclusion_package_clears_pid()
    {
        // §4.2：选包名 → Scope=Package 清 PID；PID 框显示绑定列表（只读）
        // （Pid 作用域下包名框禁用，真实路径 = 先清 PID 回 All 再选包名）
        var t = new TestSessionVm();
        var vm = t.Create(scope: SessionScope.Pid, exactPid: "100");
        Assert.Equal(SessionScope.Pid, vm.Session.Scope);

        vm.PidText = string.Empty; // 回 All
        Assert.Equal(SessionScope.All, vm.Session.Scope);
        vm.SelectedPackage = vm.PackageOptions.First(p => p.ProcessName == "com.example.app");

        Assert.Equal(SessionScope.Package, vm.Session.Scope);
        Assert.Equal("com.example.app", vm.Session.PackageName);
        Assert.False(vm.IsPidBoxEnabled); // PID 框只读
        Assert.Equal("com.example.app", vm.Session.Title); // 标题恢复派生

        // 作用域切换后绑定列表清空（ChangeScope 重置追踪）；索引刷新回填 → 只读显示
        Assert.Equal(string.Empty, vm.PidText);
        vm.Session.UpdatePidSet(new HashSet<string> { "100" });
        vm.RefreshPackageOptions();
        Assert.Equal("100", vm.PidText);
    }

    [Fact]
    public void Scope_mutual_exclusion_pid_clears_package()
    {
        // §4.2：填 PID → Scope=Pid，包名解析显示（只读组合框）
        var t = new TestSessionVm();
        var vm = t.Create(scope: SessionScope.Package, packageName: "com.example.app");
        Assert.Equal(SessionScope.Package, vm.Session.Scope);

        vm.PidText = "200";

        Assert.Equal(SessionScope.Pid, vm.Session.Scope);
        Assert.Equal("200", vm.Session.ExactPid);
        Assert.False(vm.IsPackageComboEnabled); // 包名框只读
        Assert.Equal("com.other", vm.SelectedPackage?.ProcessName); // 解析到的包名
        Assert.Equal("PID 200", vm.Session.Title);
    }

    [Fact]
    public void Clearing_pid_returns_to_all_scope()
    {
        var t = new TestSessionVm();
        var vm = t.Create(scope: SessionScope.Pid, exactPid: "100");

        vm.PidText = string.Empty;

        Assert.Equal(SessionScope.All, vm.Session.Scope);
        Assert.True(vm.IsPackageComboEnabled);
        Assert.True(vm.IsPidBoxEnabled);
    }

    [Fact]
    public void Non_digit_pid_text_rejected_without_scope_change()
    {
        var t = new TestSessionVm();
        var vm = t.Create();

        vm.PidText = "abc";

        Assert.Equal(SessionScope.All, vm.Session.Scope);
        Assert.Equal("PID 仅支持数字", vm.StatusText);
    }

    [Fact]
    public void AppendBatch_respects_pause_and_filters()
    {
        var t = new TestSessionVm();
        var vm = t.Create();
        vm.IsPaused = true;
        vm.AppendBatch([Line("I", "T", "while paused")]);
        Assert.Empty(vm.VisibleLines);

        vm.IsPaused = false;
        vm.SelectedLevel = "W";
        vm.AppendBatch([Line("I", "T", "info"), Line("E", "T", "error")]);
        Assert.Single(vm.VisibleLines);
        Assert.Equal("E", vm.VisibleLines[0].Primary.Level);
    }

    [Fact]
    public void AppendBatch_collapses_stack_frames()
    {
        // F34：连续栈帧折叠为单行
        var t = new TestSessionVm();
        var vm = t.Create();
        vm.AppendBatch(
        [
            Line("E", "AndroidRuntime", "FATAL EXCEPTION: main"),
            Line("E", "AndroidRuntime", "\tat com.example.Foo.bar(Foo.java:10)"),
            Line("E", "AndroidRuntime", "\tat com.example.Foo.baz(Foo.java:20)"),
            Line("E", "AndroidRuntime", "Process: com.example"),
        ]);

        // FATAL(非栈) + 2 栈帧(折叠) + Process(非栈收尾) = 2 DisplayLine，首行折叠 2 帧
        Assert.Equal(2, vm.VisibleLines.Count);
        Assert.Equal(2, vm.VisibleLines[0].CollapsedCount);
    }

    [Fact]
    public void Signal_count_tracks_visible_lines()
    {
        var t = new TestSessionVm();
        t.Buffer.AddRange(
        [
            Line("E", "AndroidRuntime", "FATAL EXCEPTION: main"),
            Line("E", "AndroidRuntime", "Process: com.example, PID: 1"),
            Line("I", "SystemServer", "normal"),
        ]);
        var vm = t.Create();

        vm.SelectedLevel = "E"; // 触发重放 → 信号计数
        Assert.Equal(1, vm.SignalCount); // 仅 FATAL EXCEPTION 行是信号（Process 行不算）
    }

    [Fact]
    public void Clear_visible_keeps_session_config()
    {
        var t = new TestSessionVm();
        t.Buffer.Add(Line("I", "T", "line"));
        var vm = t.Create();
        Assert.Single(vm.VisibleLines);

        vm.ClearVisible();

        Assert.Empty(vm.VisibleLines);
        Assert.Equal(0, vm.SignalCount);
        Assert.Equal("全部", vm.SelectedLevel); // 过滤条件不丢
    }

    [Fact]
    public void Export_writes_filtered_txt_only()
    {
        var t = new TestSessionVm();
        t.Buffer.AddRange(
        [
            Line("I", "T", "noise"),
            Line("E", "AndroidRuntime", "FATAL EXCEPTION: main"),
        ]);
        var vm = t.Create();
        vm.SelectedLevel = "E";
        var dir = Path.Combine(Path.GetTempPath(), "yovo-session-export", Guid.NewGuid().ToString("N"));

        var file = vm.Export(t.Buffer, dir);

        Assert.True(File.Exists(file));
        var lines = File.ReadAllLines(file);
        Assert.Single(lines);
        Assert.Contains("FATAL EXCEPTION", lines[0]);
        Directory.Delete(dir, recursive: true);
    }

    [Fact]
    public void Display_limit_trims_oldest_visible_lines()
    {
        var t = new TestSessionVm();
        var session = new LogSession("s1", SessionScope.All);
        var vm = new LogSessionViewModel(session, new FakeIndex(), () => t.Buffer, 3);

        for (var i = 0; i < 5; i++)
            vm.AppendBatch([Line("I", "T", $"line {i}")]);

        Assert.Equal(3, vm.VisibleLines.Count); // 尾部 3 条（最新优先）
        Assert.Equal("line 2", vm.VisibleLines[0].Primary.Message);
    }

    // ==================== 测试支撑 ====================

    private sealed class NoopAdb : IAdbCommandExecutor
    {
        public Task<AdbTextResult> ExecuteAsync(DeviceSerial? serial, string adbArgs, TimeSpan? timeout = null, CancellationToken ct = default)
            => Task.FromResult(new AdbTextResult("", "", 0, 0));
    }

    private sealed class NoopLog : IAppLog
    {
        public void Write(AppLogLevel level, string message, string source = "", IReadOnlyDictionary<string, string>? tags = null) { }
        public void Info(string message, string source = "", IReadOnlyDictionary<string, string>? tags = null) { }
        public void Warn(string message, string source = "", IReadOnlyDictionary<string, string>? tags = null) { }
        public void Error(string message, string source = "", IReadOnlyDictionary<string, string>? tags = null) { }
        public IDisposable Subscribe(AppLogFilter? filter, Action<AppLogEntry> handler) => new Noop();
        public IReadOnlyList<AppLogEntry> Snapshot(AppLogFilter? filter = null, int max = 2000) => [];
        private sealed class Noop : IDisposable { public void Dispose() { } }
    }
}
