using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Process;

namespace Yovo.Platform.Abstractions.Adb;

/// <summary>ADB 文本命令结果（纯原始输出；成败判定不在本层）</summary>
public sealed record AdbTextResult(string Output, string Error, int ExitCode, long ElapsedMs);

/// <summary>传输进度（文件 push/pull）</summary>
public sealed record TransferProgress(long TransferredBytes, long? TotalBytes, double? Percent);

/// <summary>
/// ADB 命令执行切片 — 短命令全缓冲。
/// adbArgs 不含 adb 自身路径（由 IToolResolver 注入）；serial 为 null 表示全局命令（devices 等）。
/// 超时抛 TimeoutException；取消抛 OperationCanceledException；adb 不可用抛 InvalidOperationException。
/// </summary>
public interface IAdbCommandExecutor
{
    Task<AdbTextResult> ExecuteAsync(
        DeviceSerial? serial, string adbArgs,
        TimeSpan? timeout = null, CancellationToken ct = default);
}

/// <summary>ADB 流式执行切片 — logcat 等大输出（取消 = Kill）</summary>
public interface IAdbStreamingExecutor
{
    Task<IStreamingProcess> ExecuteStreamingAsync(
        DeviceSerial? serial, string adbArgs, CancellationToken ct = default);
}

/// <summary>ADB 传输切片 — push/pull + 进度（取消 = Kill adb）</summary>
public interface IAdbTransfer
{
    Task PushAsync(DeviceSerial serial, string localPath, string remotePath,
        IProgress<TransferProgress>? progress = null, CancellationToken ct = default);

    Task PullAsync(DeviceSerial serial, string remotePath, string localPath,
        IProgress<TransferProgress>? progress = null, CancellationToken ct = default);
}

/// <summary>ADB 隧道切片 — forward/reverse（投屏等远期使用，本期实现通用桩）</summary>
public interface IAdbTunnel
{
    /// <summary>建立 forward 隧道；Dispose 释放</summary>
    Task<IDisposable> ForwardAsync(DeviceSerial serial, string local, string remote, CancellationToken ct = default);

    Task<IDisposable> ReverseAsync(DeviceSerial serial, string remote, string local, CancellationToken ct = default);
}

/// <summary>ADB 客户端总接口（切片聚合；模块只注入所需切片 — ISP）</summary>
public interface IAdbClient :
    IAdbCommandExecutor,
    IAdbStreamingExecutor,
    IAdbTransfer,
    IAdbTunnel
{ }
