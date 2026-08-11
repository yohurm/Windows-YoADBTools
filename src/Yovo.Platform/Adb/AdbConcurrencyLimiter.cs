using Yovo.Platform.Abstractions.Adb;
using Yovo.Platform.Abstractions.Settings;

namespace Yovo.Platform.Adb;

/// <summary>
/// ADB 并发限流实现 — SemaphoreSlim 信号量。
/// 并行度读设置 `adb.concurrency`（app scope，默认 4，钳制 1–16）。
/// 注意：信号量不可重入 — 调用方必须只在最外层 ADB 入口 acquire（AdbClient 已保证）。
/// </summary>
public class AdbConcurrencyLimiter : IAdbConcurrencyLimiter
{
    private readonly SemaphoreSlim _semaphore;

    public AdbConcurrencyLimiter(ISettingsStore settings)
    {
        var parallelism = Math.Clamp(
            settings.Get(SettingsScope.App, AdbConcurrencyKey, DefaultParallelism),
            1, MaxParallelism);
        _semaphore = new SemaphoreSlim(parallelism, parallelism);
    }

    public const string AdbConcurrencyKey = "adb.concurrency";
    public const int DefaultParallelism = 4;
    public const int MaxParallelism = 16;

    public async Task<IDisposable> AcquireAsync(CancellationToken ct = default)
    {
        await _semaphore.WaitAsync(ct);
        return new Lease(_semaphore);
    }

    private sealed class Lease(SemaphoreSlim semaphore) : IDisposable
    {
        private bool _disposed;

        public void Dispose()
        {
            if (_disposed)
                return;
            _disposed = true;
            semaphore.Release();
        }
    }
}
