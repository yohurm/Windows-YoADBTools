using Yovo.Modules.LogAnalyzer.Application;
using Yovo.Platform.Abstractions.Adb;
using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Logging;
using Xunit;

namespace Yovo.Modules.LogAnalyzer.Tests;

/// <summary>工作区（M1 F40）：会话增删焦点 / 关闭最后重建 / 设备绑定清追踪 / PID 重绑分发</summary>
public class LogWorkspaceTests
{
    private static readonly DeviceSerial SerialA = new("V2361A");
    private static readonly DeviceSerial SerialB = new("V9999");

    [Fact]
    public void EnsureDefault_creates_all_session()
    {
        var ws = new LogWorkspace();

        var session = ws.EnsureDefault();

        Assert.Single(ws.Sessions);
        Assert.Equal(SessionScope.All, session.Scope);
        Assert.Equal("全部日志", session.Title);
        Assert.Same(session, ws.ActiveSession);
    }

    [Fact]
    public void Add_selects_new_session_and_tracks_events()
    {
        var ws = new LogWorkspace();
        var events = 0;
        ws.SessionsChanged += () => events++;

        ws.EnsureDefault();
        var pkg = ws.Add(SessionScope.Package, packageName: "com.example.app");

        Assert.Equal(2, ws.Sessions.Count);
        Assert.Same(pkg, ws.ActiveSession);
        Assert.Equal("com.example.app", pkg.Title);
        Assert.Equal(2, events);
    }

    [Fact]
    public void Select_is_idempotent_and_only_fires_on_change()
    {
        var ws = new LogWorkspace();
        ws.EnsureDefault();
        var second = ws.Add(SessionScope.Pid, exactPid: "123");
        var events = 0;
        ws.SessionsChanged += () => events++;

        ws.Select(second.Id); // 已是激活：无事件
        Assert.Equal(0, events);

        ws.Select(ws.Sessions[0].Id); // 切换
        Assert.Equal(1, events);
        Assert.Same(ws.Sessions[0], ws.ActiveSession);
    }

    [Fact]
    public void Close_active_falls_back_to_neighbor()
    {
        var ws = new LogWorkspace();
        var first = ws.EnsureDefault();
        var second = ws.Add(SessionScope.Pid, exactPid: "1");
        var third = ws.Add(SessionScope.Pid, exactPid: "2");
        Assert.Same(third, ws.ActiveSession);

        ws.Close(third.Id);

        Assert.Equal(2, ws.Sessions.Count);
        Assert.Same(second, ws.ActiveSession); // 前一个补位
        Assert.True(ws.Close(first.Id));
        Assert.Same(second, ws.ActiveSession);
    }

    [Fact]
    public void Close_last_session_rebuilds_default_all()
    {
        var ws = new LogWorkspace();
        var only = ws.EnsureDefault();

        ws.Close(only.Id);

        Assert.Single(ws.Sessions); // 至少保留 1 个
        Assert.Equal(SessionScope.All, ws.Sessions[0].Scope);
        Assert.NotEqual(only.Id, ws.Sessions[0].Id); // 新建（非原实例）
        Assert.Same(ws.Sessions[0], ws.ActiveSession);
    }

    [Fact]
    public void Close_unknown_id_returns_false()
    {
        var ws = new LogWorkspace();
        ws.EnsureDefault();

        Assert.False(ws.Close("nope"));
    }

    [Fact]
    public void BindDevice_resets_package_pid_tracking()
    {
        var ws = new LogWorkspace();
        var pkg = ws.Add(SessionScope.Package, packageName: "com.example.app");
        pkg.UpdatePidSet(new HashSet<string> { "100", "200" });
        Assert.Equal(2, pkg.EffectivePidSet.Count);

        ws.BindDevice(SerialB); // 设备切换

        Assert.Empty(pkg.EffectivePidSet); // 强制清空（避免串设备）
        Assert.Equal(SerialB, ws.BoundDevice);
    }

    [Fact]
    public void RefreshPidSets_rebinds_package_sessions_and_fires_on_change()
    {
        var ws = new LogWorkspace();
        var pkg = ws.Add(SessionScope.Package, packageName: "com.example.app");
        var events = 0;
        ws.PidSetChanged += () => events++;
        var index = new FakeIndex(
            [new("100", "com.example.app", DateTimeOffset.Now), new("200", "com.other", DateTimeOffset.Now)]);

        ws.RefreshPidSets(index);

        Assert.Equal(["100"], pkg.PidSet);
        Assert.Equal(1, events);

        // 无变化：不触发（轻量重放）
        ws.RefreshPidSets(index);
        Assert.Equal(1, events);

        // 重绑（应用重启，PID 变化）：历史保留 + 触发
        index = new FakeIndex(
            [new("300", "com.example.app", DateTimeOffset.Now), new("200", "com.other", DateTimeOffset.Now)]);
        ws.RefreshPidSets(index);

        Assert.Contains("300", pkg.PidSet);
        Assert.Contains("100", pkg.HistoryPids); // F43：旧 PID 留在时间线
        Assert.Equal(2, events);
    }

    [Fact]
    public void RefreshPidSets_skips_non_package_sessions()
    {
        var ws = new LogWorkspace();
        ws.Add(SessionScope.Pid, exactPid: "123");
        var events = 0;
        ws.PidSetChanged += () => events++;

        ws.RefreshPidSets(new FakeIndex());

        Assert.Equal(0, events);
    }

    // ==================== 测试支撑 ====================

    private sealed class FakeIndex(IReadOnlyList<ProcessEntry>? entries = null)
        : ProcessIndexService(new NoopAdb(), new NoopLog())
    {
        public override IReadOnlyList<ProcessEntry> Snapshot => entries ?? [];
    }

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
