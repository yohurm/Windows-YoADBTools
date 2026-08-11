using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Logging;
using Yovo.Platform.Abstractions.Messaging;
using Yovo.Platform.Abstractions.Tasks;
using Yovo.Platform.Logging;
using Yovo.Platform.Messaging;
using Yovo.Platform.Tasks;
using Xunit;

namespace Yovo.Platform.Tests;

/// <summary>基础设施：事件总线 / 应用日志 / 后台任务中心</summary>
public class InfrastructureTests
{
    // ===== 事件总线 =====

    private sealed record TestEvent(string Value) : IIntegrationEvent;

    [Fact]
    public void EventBus_publishes_to_subscribers_and_unsubscribes()
    {
        var bus = new EventBus();
        var received = new List<string>();

        using var sub = bus.Subscribe<TestEvent>(e => received.Add(e.Value));
        bus.Publish(new TestEvent("one"));
        bus.Publish(new TestEvent("two"));

        Assert.Equal(["one", "two"], received);

        sub.Dispose();
        bus.Publish(new TestEvent("three"));
        Assert.Equal(["one", "two"], received); // 退订后不再收到
    }

    [Fact]
    public void EventBus_subscriber_exception_does_not_break_others()
    {
        var bus = new EventBus();
        var received = new List<string>();

        using var bad = bus.Subscribe<TestEvent>(_ => throw new InvalidOperationException("boom"));
        using var good = bus.Subscribe<TestEvent>(e => received.Add(e.Value));

        bus.Publish(new TestEvent("ok"));

        Assert.Equal(["ok"], received);
    }

    [Fact]
    public void EventBus_does_not_call_unrelated_types()
    {
        var bus = new EventBus();
        var received = new List<string>();
        using var sub = bus.Subscribe<TestEvent>(e => received.Add(e.Value));

        bus.Publish(new DevicesRefreshed([])); // 不同类型

        Assert.Empty(received);
    }

    // ===== 应用日志 =====

    [Fact]
    public void AppLog_filters_by_source_and_supports_snapshot()
    {
        var log = new AppLogService();
        var terminalEntries = new List<AppLogEntry>();
        using var sub = log.Subscribe(new AppLogFilter(Source: "adb-terminal"), e => terminalEntries.Add(e));

        log.Info("hello", "adb-terminal");
        log.Error("boom", "file-manager");
        log.Warn("warn", "adb-terminal");

        Assert.Equal(2, terminalEntries.Count);
        Assert.Equal("hello", terminalEntries[0].Message);
        Assert.Equal(AppLogLevel.Warn, terminalEntries[1].Level);

        var snapshot = log.Snapshot(new AppLogFilter(Source: "adb-terminal"));
        Assert.Equal(2, snapshot.Count);
    }

    [Fact]
    public void AppLog_ring_buffer_caps_and_snapshot_returns_latest()
    {
        var log = new AppLogService();
        for (var i = 0; i < 5; i++)
            log.Info($"line{i}", "src");

        var snapshot = log.Snapshot(max: 3);

        Assert.Equal(["line2", "line3", "line4"], snapshot.Select(e => e.Message));
    }

    // ===== 后台任务中心 =====

    [Fact]
    public void BackgroundTaskCenter_register_update_complete()
    {
        var center = new BackgroundTaskCenter();
        var changed = 0;
        center.Changed += () => changed++;

        var id = center.Register(new BackgroundTaskDescriptor("上传", "file-manager"));
        Assert.Single(center.Active);
        Assert.Equal(1, changed);

        center.Update(id, BackgroundTaskState.Running, progressPercent: 50);
        Assert.Equal(50, center.Active[0].ProgressPercent);

        center.Complete(id, BackgroundTaskCompletion.Success);
        Assert.Empty(center.Active);
        Assert.Equal(3, changed);
    }
}
