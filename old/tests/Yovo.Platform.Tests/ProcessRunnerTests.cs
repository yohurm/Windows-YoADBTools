using System.Diagnostics;
using Yovo.Platform.Abstractions.Process;
using Yovo.Platform.Process;
using Xunit;

namespace Yovo.Platform.Tests;

/// <summary>
/// 进程运行器（真实进程）：流式取消 Kill（C2）/ Dispose 杀树。
/// 用长驻 ping 进程验证：未杀则 WaitForExit 需 60 秒，被杀则快速完成。
/// </summary>
public class ProcessRunnerTests
{
    private const string LongPingArgs = "/c ping -n 60 127.0.0.1";

    [Fact]
    public async Task RunAsync_timeout_kills_process_and_throws_timeout()
    {
        var runner = new ProcessRunner();
        var spec = new ProcessSpec("cmd.exe", LongPingArgs, Timeout: TimeSpan.FromSeconds(2));

        var sw = Stopwatch.StartNew();
        var ex = await Assert.ThrowsAsync<TimeoutException>(
            () => runner.RunAsync(spec));
        sw.Stop();

        Assert.Contains("超时", ex.Message);
        Assert.True(sw.Elapsed < TimeSpan.FromSeconds(10), $"超时未及时返回: {sw.Elapsed}");
    }

    [Fact]
    public async Task RunAsync_cancel_kills_process()
    {
        var runner = new ProcessRunner();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));

        var sw = Stopwatch.StartNew();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => runner.RunAsync(new ProcessSpec("cmd.exe", LongPingArgs), cts.Token));
        sw.Stop();

        Assert.True(sw.Elapsed < TimeSpan.FromSeconds(10), $"取消未及时返回: {sw.Elapsed}");
    }

    [Fact]
    public async Task StreamingProcess_cancel_kills_process()
    {
        var runner = new ProcessRunner();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(1));

        await using var process = await runner.StartStreamingAsync(
            new ProcessSpec("cmd.exe", LongPingArgs), cts.Token);

        // 取消后进程应被杀：WaitForExit 快速完成（60 秒 ping 若未杀会挂住）
        var sw = Stopwatch.StartNew();
        await process.WaitForExitAsync();
        sw.Stop();

        Assert.True(sw.Elapsed < TimeSpan.FromSeconds(10), $"取消后进程未被 Kill: {sw.Elapsed}");
    }

    [Fact]
    public async Task StreamingProcess_dispose_is_safe_and_idempotent()
    {
        var runner = new ProcessRunner();

        var process = await runner.StartStreamingAsync(new ProcessSpec("cmd.exe", LongPingArgs));

        // Dispose 未退出进程 → 内部 Kill 杀树后释放（C2：不抛、无残留）
        await process.DisposeAsync();
        // 幂等：重复 Dispose / Kill 不抛（进程对象已释放）
        await process.DisposeAsync();
        process.Kill();
    }

    [Fact]
    public async Task StreamingProcess_kill_terminates_process_quickly()
    {
        var runner = new ProcessRunner();
        await using var process = await runner.StartStreamingAsync(
            new ProcessSpec("cmd.exe", LongPingArgs));

        process.Kill();

        var sw = Stopwatch.StartNew();
        await process.WaitForExitAsync();
        sw.Stop();
        Assert.True(sw.Elapsed < TimeSpan.FromSeconds(10), $"Kill 后进程未及时退出: {sw.Elapsed}");
    }

    [Fact]
    public async Task StreamingProcess_yields_output_lines()
    {
        var runner = new ProcessRunner();
        await using var process = await runner.StartStreamingAsync(
            new ProcessSpec("cmd.exe", "/c echo hello-line && echo err-line 1>&2"));

        var stdout = new List<string>();
        var stderr = new List<string>();
        await foreach (var chunk in process.Output)
        {
            if (chunk.StandardOutput is { } so)
                stdout.Add(so);
            if (chunk.StandardError is { } se)
                stderr.Add(se);
        }

        Assert.Contains(stdout, l => l.Contains("hello-line"));
        Assert.Contains(stderr, l => l.Contains("err-line"));
    }
}
