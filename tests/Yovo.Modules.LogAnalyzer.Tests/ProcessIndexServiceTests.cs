using Yovo.Modules.LogAnalyzer.Application;
using Yovo.Platform.Abstractions.Adb;
using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Logging;
using Xunit;

namespace Yovo.Modules.LogAnalyzer.Tests;

/// <summary>进程索引：ps 多格式解析 / PidSet 映射（含子进程）/ 周期刷新 / 失败降级</summary>
public class ProcessIndexServiceTests
{
    private static readonly DeviceSerial Serial = new("V2361A");
    private static readonly DateTimeOffset Now = DateTimeOffset.Now;

    // ==================== ps 解析 ====================

    [Fact]
    public void PsParser_parses_two_column_output()
    {
        const string output = """
        PID NAME
          1   init
        100   com.example.app
        101   com.example.app:push
        200   system_server
        """;

        var entries = ProcessPsParser.Parse(output, Now);

        Assert.Equal(4, entries.Count);
        Assert.Equal("com.example.app", entries[1].ProcessName);
        Assert.Equal("100", entries[1].Pid);
        Assert.Equal("com.example.app:push", entries[2].ProcessName); // 子进程保留全名
    }

    [Fact]
    public void PsParser_parses_full_format_output()
    {
        // 旧版 Android / 不支持 -o 时的完整 ps -A 格式
        const string output = """
        USER     PID  PPID     VSZ    RSS WCHAN    ADDR S NAME
        root       1     0   12345   1234 SyS_epoll 0    S init
        u0_a10   100    50  123456  23456 SyS_epoll 0    S com.example.app
        u0_a10   101    50  123456  23456 SyS_epoll 0    S com.example.app:push
        """;

        var entries = ProcessPsParser.Parse(output, Now);

        Assert.Equal(3, entries.Count);
        Assert.Equal("100", entries[1].Pid);
        Assert.Equal("com.example.app", entries[1].ProcessName);
        Assert.Equal("101", entries[2].Pid);
        Assert.Equal("com.example.app:push", entries[2].ProcessName);
    }

    [Fact]
    public void PsParser_skips_garbage_and_header_lines()
    {
        const string output = """
        PID NAME
        not a process line
        system
          55   com.ok
        """;

        var entries = ProcessPsParser.Parse(output, Now);

        Assert.Single(entries);
        Assert.Equal("com.ok", entries[0].ProcessName);
    }

    [Fact]
    public void PsParser_empty_output_yields_empty_list()
    {
        Assert.Empty(ProcessPsParser.Parse("", Now));
    }

    // ==================== PidSet 映射 ====================

    [Fact]
    public void PidSetFor_exact_match_and_child_process_flag()
    {
        var index = Index(
            new("100", "com.example.app", Now),
            new("101", "com.example.app:push", Now),
            new("200", "com.example.app2", Now)); // 前缀相似但不是子进程

        // 默认精确匹配（ADR-LA-008）
        var exact = index.PidSetFor("com.example.app", includeChildren: false);
        Assert.Equal(["100"], exact);
        Assert.DoesNotContain("101", exact);

        // 包含子进程：前缀匹配 com.foo:*
        var children = index.PidSetFor("com.example.app", includeChildren: true);
        Assert.Equal(2, children.Count);
        Assert.Contains("101", children);
    }

    [Fact]
    public void FindByPid_resolves_package_name()
    {
        var index = Index(new ProcessEntry("123", "com.example.app", Now));

        Assert.Equal("com.example.app", index.FindByPid("123")?.ProcessName);
        Assert.Null(index.FindByPid("999"));
    }

    // ==================== 周期刷新与降级 ====================

    [Fact]
    public async Task Refresh_loop_populates_snapshot_and_fires_changed()
    {
        var adb = new FakeAdb("""
        PID NAME
        100   com.example.app
        """);
        var index = new ProcessIndexService(adb, new SilentLog());
        var changedCount = 0;
        index.Changed += () => changedCount++;

        index.Start(Serial);

        // 首次刷新（立即）+ 后续周期
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while ((index.Snapshot.Count == 0 || changedCount == 0) && DateTime.UtcNow < deadline)
            await Task.Delay(50);

        Assert.True(index.IsAvailable);
        Assert.NotNull(index.LastUpdatedUtc);
        Assert.Single(index.Snapshot);
        Assert.Equal("com.example.app", index.Snapshot[0].ProcessName);
        Assert.True(changedCount >= 1);

        index.Stop();
    }

    [Fact]
    public async Task Refresh_failure_degrades_to_pid_only_mode()
    {
        var adb = new FakeAdb(new AdbTextResult("", "failed", 1, 10)); // ps 失败
        var index = new ProcessIndexService(adb, new SilentLog());

        index.Start(Serial);
        await Task.Delay(500); // 等首次刷新失败

        Assert.False(index.IsAvailable); // 降级：仅 PID 模式
        Assert.Empty(index.Snapshot);

        index.Stop();
    }

    [Fact]
    public async Task Stop_then_start_restarts_refresh_loop()
    {
        var adb = new FakeAdb("""
        PID NAME
        100   com.example.app
        """);
        var index = new ProcessIndexService(adb, new SilentLog());

        index.Start(Serial);
        await Task.Delay(300);
        index.Stop();
        var snapshotAfterStop = index.Snapshot;

        index.Start(Serial); // 重启
        await Task.Delay(300);

        Assert.True(index.IsAvailable);
        Assert.Single(snapshotAfterStop); // 旧快照保留（降级语义）
        index.Stop();
    }

    // ==================== 测试支撑 ====================

    /// <summary>固定快照替身（virtual Snapshot）</summary>
    private sealed class FixedIndex(IReadOnlyList<ProcessEntry> entries) : ProcessIndexService(new FakeAdb(""), new SilentLog())
    {
        public override IReadOnlyList<ProcessEntry> Snapshot => entries;
    }

    private static ProcessIndexService Index(params ProcessEntry[] entries)
        => new FixedIndex(entries);

    private sealed class FakeAdb : IAdbCommandExecutor
    {
        private readonly string _output;
        private readonly AdbTextResult? _fixed;

        public FakeAdb(string output) => _output = output;

        public FakeAdb(AdbTextResult fixedResult) => _fixed = fixedResult;

        public Task<AdbTextResult> ExecuteAsync(DeviceSerial? serial, string adbArgs, TimeSpan? timeout = null, CancellationToken ct = default)
            => Task.FromResult(_fixed ?? new AdbTextResult(_output, "", 0, 0));
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
}
