using System.IO;
using Yovo.Platform.Adb;
using Yovo.Platform.Settings;
using Xunit;

namespace Yovo.Platform.Tests;

/// <summary>ADB 并发限流（§10.1）：信号量槽位语义</summary>
public class AdbConcurrencyLimiterTests : IDisposable
{
    private readonly string _tempRoot;

    public AdbConcurrencyLimiterTests()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), "yovo-limit-test", Guid.NewGuid().ToString("N"));
    }

    public void Dispose()
    {
        try
        {
            Directory.Delete(_tempRoot, recursive: true);
        }
        catch
        {
            // 清理失败忽略
        }
    }

    private AdbConcurrencyLimiter Create(int parallelism = 4)
    {
        var settings = new SettingsStore(_tempRoot);
        settings.Set(Abstractions.Settings.SettingsScope.App, "adb.concurrency", parallelism);
        return new AdbConcurrencyLimiter(settings);
    }

    [Fact]
    public async Task Acquire_limits_concurrent_slots()
    {
        var limiter = Create(parallelism: 2);

        using var slot1 = await limiter.AcquireAsync();
        using var slot2 = await limiter.AcquireAsync();

        // 槽位占满：第三个 acquire 阻塞（200ms 内未获取）
        var third = limiter.AcquireAsync();
        var completed = await Task.WhenAny(third, Task.Delay(200));
        Assert.NotSame(third, completed); // 未完成 = 被阻塞

        // 释放一个槽位后，第三个立即获得
        slot2.Dispose();
        using var slot3 = await third.WaitAsync(TimeSpan.FromSeconds(1));
        Assert.NotNull(slot3);
    }

    [Fact]
    public async Task Acquire_returns_when_slot_available()
    {
        var limiter = Create(parallelism: 1);

        using var slot1 = await limiter.AcquireAsync();
        slot1.Dispose(); // 立即释放

        using var slot2 = await limiter.AcquireAsync().WaitAsync(TimeSpan.FromSeconds(1));
        Assert.NotNull(slot2);
    }

    [Fact]
    public async Task Acquire_respects_cancellation()
    {
        var limiter = Create(parallelism: 1);
        using var slot1 = await limiter.AcquireAsync();
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(100));

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => limiter.AcquireAsync(cts.Token));
    }
}
