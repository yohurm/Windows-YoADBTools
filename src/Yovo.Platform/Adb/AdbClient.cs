using System.Text;
using System.Text.RegularExpressions;
using Yovo.Platform.Abstractions.Adb;
using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Process;
using Yovo.Platform.Abstractions.Tools;

namespace Yovo.Platform.Adb;

/// <summary>
/// ADB 客户端实现 — 四个能力切片的进程落地。
/// adbArgs 不含 adb 路径（ToolResolver 注入）；成败判定永远不在此层（模块领域规则）。
/// </summary>
public partial class AdbClient(IProcessRunner runner, IToolResolver tools) : IAdbClient
{
    private static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(30);
    private static readonly Encoding Utf8 = Encoding.UTF8;

    public async Task<AdbTextResult> ExecuteAsync(
        DeviceSerial? serial, string adbArgs,
        TimeSpan? timeout = null, CancellationToken ct = default)
    {
        var tool = tools.Resolve(ToolId.Adb);
        if (!tool.IsAvailable)
            throw new InvalidOperationException($"adb 不可用: {tool.ExePath}");

        var spec = new ProcessSpec(
            tool.ExePath,
            BuildArgs(serial, adbArgs),
            StdOutEncoding: Utf8,
            StdErrEncoding: Utf8,
            Timeout: timeout ?? DefaultTimeout);

        var result = await runner.RunAsync(spec, ct);
        return new AdbTextResult(result.Output, result.Error, result.ExitCode, result.ElapsedMs);
    }

    public Task<IStreamingProcess> ExecuteStreamingAsync(
        DeviceSerial? serial, string adbArgs, CancellationToken ct = default)
    {
        var tool = tools.Resolve(ToolId.Adb);
        if (!tool.IsAvailable)
            throw new InvalidOperationException($"adb 不可用: {tool.ExePath}");

        var spec = new ProcessSpec(
            tool.ExePath,
            BuildArgs(serial, adbArgs),
            StdOutEncoding: Utf8,
            StdErrEncoding: Utf8);
        return runner.StartStreamingAsync(spec, ct);
    }

    // ==================== 传输（push/pull + 进度） ====================

    public Task PushAsync(DeviceSerial serial, string localPath, string remotePath,
        IProgress<TransferProgress>? progress = null, CancellationToken ct = default)
        => TransferAsync("push", serial, localPath, remotePath, progress, ct);

    public Task PullAsync(DeviceSerial serial, string remotePath, string localPath,
        IProgress<TransferProgress>? progress = null, CancellationToken ct = default)
        => TransferAsync("pull", serial, localPath, remotePath, progress, ct);

    /// <summary>adb push/pull：流式解析进度行（"file: 45% | 1234/5678 | 0:00:01"），退出码非 0 抛异常</summary>
    private async Task TransferAsync(string direction, DeviceSerial serial,
        string pathArg1, string pathArg2, IProgress<TransferProgress>? progress, CancellationToken ct)
    {
        var args = $"{direction} {QuoteArg(pathArg1)} {QuoteArg(pathArg2)}";
        await using var stream = await ExecuteStreamingAsync(serial, args, ct);

        await foreach (var chunk in stream.Output.WithCancellation(ct))
        {
            var text = chunk.StandardOutput ?? chunk.StandardError;
            if (text is null)
                continue;
            if (ProgressRegex().Match(text) is { Success: true } match)
            {
                progress?.Report(new TransferProgress(
                    TransferredBytes: long.TryParse(match.Groups["done"].Value, out var done) ? done : 0,
                    TotalBytes: long.TryParse(match.Groups["total"].Value, out var total) ? total : null,
                    Percent: double.TryParse(match.Groups["percent"].Value, out var pct) ? pct : null));
            }
        }

        var exitCode = await stream.WaitForExitAsync(ct);
        if (exitCode != 0)
            throw new InvalidOperationException($"adb {direction} 失败 (exit {exitCode}): {pathArg1} → {pathArg2}");
    }

    // ==================== 隧道（forward/reverse；远期投屏使用） ====================

    public async Task<IDisposable> ForwardAsync(DeviceSerial serial, string local, string remote,
        CancellationToken ct = default)
    {
        var result = await ExecuteAsync(serial, $"forward {local} {remote}", TimeSpan.FromSeconds(15), ct);
        if (result.ExitCode != 0)
            throw new InvalidOperationException($"adb forward 失败: {result.Error.Trim()}");
        return new TunnelLease(this, serial, $"forward --remove {local}");
    }

    public async Task<IDisposable> ReverseAsync(DeviceSerial serial, string remote, string local,
        CancellationToken ct = default)
    {
        var result = await ExecuteAsync(serial, $"reverse {remote} {local}", TimeSpan.FromSeconds(15), ct);
        if (result.ExitCode != 0)
            throw new InvalidOperationException($"adb reverse 失败: {result.Error.Trim()}");
        return new TunnelLease(this, serial, $"reverse --remove {remote}");
    }

    /// <summary>隧道租约 — Dispose 时执行移除命令（L7：同步等待完成，确保清理可靠；失败不抛出）</summary>
    private sealed class TunnelLease(AdbClient client, DeviceSerial serial, string removeArgs) : IDisposable
    {
        private bool _disposed;

        public void Dispose()
        {
            if (_disposed)
                return;
            _disposed = true;
            try
            {
                client.ExecuteAsync(serial, removeArgs, TimeSpan.FromSeconds(10))
                    .GetAwaiter().GetResult(); // 同步等待：Dispose 语义保证隧道清理完成
            }
            catch
            {
                // 清理失败不抛出（进程已退出等场景）
            }
        }
    }

    // ==================== 内部 ====================

    private static string BuildArgs(DeviceSerial? serial, string adbArgs)
        => serial is { IsEmpty: false } s ? $"-s {QuoteArg(s.Value)} {adbArgs}" : adbArgs;

    /// <summary>参数引号包裹（序列号/路径含空格；内部引号转义防参数截断，M8）</summary>
    private static string QuoteArg(string value) => $"\"{value.Replace("\"", "\\\"")}\"";

    /// <summary>adb 进度行："/sdcard/x.bin: 45% | 1234/5678 | 0:00:01"（老格式无总量）</summary>
    [GeneratedRegex(@"(?<percent>\d+)% \| (?<done>\d+)/(?<total>\d+)", RegexOptions.Compiled)]
    private static partial Regex ProgressRegex();
}
