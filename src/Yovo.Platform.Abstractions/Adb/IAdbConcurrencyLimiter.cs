namespace Yovo.Platform.Abstractions.Adb;

/// <summary>
/// ADB 并发限流（架构 v5 §10.1）— 防止打爆 adb server。
/// 短命令/流式/传输共享槽位（默认并行度 4，设置 `adb.concurrency` 可调 1–16）。
/// 长驻进程（远期投屏）不占用短命令槽位。
/// </summary>
public interface IAdbConcurrencyLimiter
{
    /// <summary>获取执行槽位（不可重入：调用方必须在其最外层 ADB 入口 acquire 一次）</summary>
    Task<IDisposable> AcquireAsync(CancellationToken ct = default);
}
