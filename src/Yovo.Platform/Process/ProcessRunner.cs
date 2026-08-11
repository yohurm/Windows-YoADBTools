using System.Diagnostics;
using System.Text;
using System.Threading.Channels;
using Yovo.Platform.Abstractions.Process;

namespace Yovo.Platform.Process;

// 本文件命名空间为 Yovo.Platform.Process，简单名 Process 会解析为命名空间；类型需别名
using Process = System.Diagnostics.Process;

/// <summary>
/// 进程运行器实现 — 短命令全缓冲 / 流式逐行 / 长驻三类进程能力。
/// 取消统一 KillTree（adb 会衍生 shell 子进程，必须连根杀）。
/// </summary>
public class ProcessRunner : IProcessRunner
{
    public async Task<ProcessResult> RunAsync(ProcessSpec spec, CancellationToken ct = default)
    {
        using var process = CreateProcess(spec, redirectOutput: true);
        var sw = Stopwatch.StartNew();
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        if (spec.Timeout is { } timeout)
            cts.CancelAfter(timeout);

        process.Start();
        var outputTask = process.StandardOutput.ReadToEndAsync();
        var errorTask = process.StandardError.ReadToEndAsync();

        try
        {
            await process.WaitForExitAsync(cts.Token);
            await Task.WhenAll(outputTask, errorTask);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            // 仅超时：按 KillTreeOnCancel 契约杀进程树后抛 TimeoutException（调用方语义层捕获）
            if (spec.KillTreeOnCancel)
                KillTree(process);
            await DrainOutputsQuietlyAsync(outputTask, errorTask); // L2：超时路径也消费输出，防未观察异常
            throw new TimeoutException($"命令执行超时: {spec.FileName} {spec.Arguments}");
        }
        catch (OperationCanceledException)
        {
            // 调用方取消（KillTreeOnCancel 契约）
            if (spec.KillTreeOnCancel)
                KillTree(process);
            await DrainOutputsQuietlyAsync(outputTask, errorTask); // L2
            throw;
        }
        finally
        {
            sw.Stop();
        }

        return new ProcessResult(
            NormalizeOutput(outputTask.Result),
            NormalizeOutput(errorTask.Result),
            process.ExitCode,
            sw.ElapsedMilliseconds);
    }

    public Task<IStreamingProcess> StartStreamingAsync(ProcessSpec spec, CancellationToken ct = default)
    {
        if (spec.Timeout is not null)
            throw new ArgumentException("流式进程不允许 Timeout（无默认超时，取消 = Kill）", nameof(spec));

        var process = CreateProcess(spec, redirectOutput: true);
        process.Start();
        var streaming = new StreamingProcess(process);

        // 契约「取消 = Kill」：取消令牌触发杀进程树（KillTreeOnCancel 默认 true）
        if (ct.CanBeCanceled)
            ct.Register(() => streaming.Kill(spec.KillTreeOnCancel));

        return Task.FromResult<IStreamingProcess>(streaming);
    }

    public Task<ILongRunningProcess> StartLongRunningAsync(ProcessSpec spec, CancellationToken ct = default)
    {
        if (spec.Timeout is not null)
            throw new ArgumentException("长驻进程不允许 Timeout（禁止默认超时）", nameof(spec));

        var process = CreateProcess(spec, redirectOutput: false);
        process.EnableRaisingEvents = true;
        process.Start();
        var longRunning = new LongRunningProcess(process);

        if (ct.CanBeCanceled)
            ct.Register(() => longRunning.Kill(spec.KillTreeOnCancel));

        return Task.FromResult<ILongRunningProcess>(longRunning);
    }

    // ==================== 内部 ====================

    private static Process CreateProcess(ProcessSpec spec, bool redirectOutput)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = spec.FileName,
            Arguments = spec.Arguments,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = redirectOutput,
            RedirectStandardError = redirectOutput,
            StandardOutputEncoding = spec.StdOutEncoding,
            StandardErrorEncoding = spec.StdErrEncoding,
            WorkingDirectory = spec.WorkingDirectory ?? string.Empty
        };
        if (spec.Environment is { } env)
        {
            foreach (var (key, value) in env)
                startInfo.Environment[key] = value;
        }
        return new Process { StartInfo = startInfo };
    }

    private static void KillTree(Process process)
    {
        try
        {
            process.Kill(true);
        }
        catch
        {
            // 已退出则忽略
        }
    }

    /// <summary>消费输出任务并吞掉其异常（进程被杀后读流中断属预期，L2）</summary>
    private static async Task DrainOutputsQuietlyAsync(Task<string> outputTask, Task<string> errorTask)
    {
        try
        {
            await Task.WhenAll(outputTask, errorTask);
        }
        catch
        {
            // 读流中断属预期（进程已被 Kill）
        }
    }

    /// <summary>规范化输出：CRLF/CR 转 LF，去行尾空白</summary>
    private static string NormalizeOutput(string output)
    {
        if (string.IsNullOrEmpty(output))
            return output;
        return string.Join("\n",
            output.Replace("\r\n", "\n").Replace('\r', '\n')
                  .Split('\n')
                  .Select(line => line.TrimEnd()));
    }
}

/// <summary>
/// 流式进程实现 — 双读循环（stdout/stderr）写入 Channel，Output 枚举即消费。
/// 进程退出后 Channel 关闭，枚举自然结束。
/// </summary>
internal sealed class StreamingProcess : IStreamingProcess
{
    private readonly Process _process;
    private readonly Channel<ProcessOutputChunk> _channel = Channel.CreateUnbounded<ProcessOutputChunk>();
    private readonly Task _stdoutTask;
    private readonly Task _stderrTask;
    private readonly Task _readerCompletion;

    public StreamingProcess(Process process)
    {
        _process = process;

        _stdoutTask = ReadLinesAsync(process.StandardOutput, isError: false);
        _stderrTask = ReadLinesAsync(process.StandardError, isError: true);

        // 双读循环完成后关闭通道（进程退出时流自然结束）
        _readerCompletion = Task.WhenAll(_stdoutTask, _stderrTask)
            .ContinueWith(_ => _channel.Writer.TryComplete(), TaskScheduler.Default);
    }

    public IAsyncEnumerable<ProcessOutputChunk> Output => ReadOutputAsync();

    private async IAsyncEnumerable<ProcessOutputChunk> ReadOutputAsync()
    {
        await foreach (var chunk in _channel.Reader.ReadAllAsync())
            yield return chunk;
        // 读循环异常（IO 故障）透传，调用方按进程失败处理（L1：stdout 与 stderr 均检查）
        var exception = _stdoutTask.Exception ?? _stderrTask.Exception;
        if (exception is not null)
            throw new IOException("标准输出读取失败", exception.InnerException);
    }

    public async Task<int> WaitForExitAsync(CancellationToken ct = default)
    {
        // .NET 8 Process.WaitForExitAsync 返回 Task（无退出码），退出后取 ExitCode
        await _process.WaitForExitAsync(ct);
        return _process.ExitCode;
    }

    /// <summary>接口实现：默认杀树</summary>
    public void Kill() => Kill(killTree: true);

    /// <summary>杀进程（KillTreeOnCancel 控制是否连根杀树 — 契约落实，C2）</summary>
    public void Kill(bool killTree)
    {
        try
        {
            _process.Kill(killTree);
        }
        catch
        {
            // 已退出则忽略
        }
    }

    private async Task ReadLinesAsync(StreamReader reader, bool isError)
    {
        try
        {
            while (await reader.ReadLineAsync() is { } line)
                _channel.Writer.TryWrite(isError
                    ? ProcessOutputChunk.StdErr(line)
                    : ProcessOutputChunk.StdOut(line));
        }
        catch (IOException)
        {
            // 进程被 Kill：流中断属预期，静默结束
        }
    }

    /// <summary>
    /// 释放：若进程仍在运行则杀树（防止取消/中断后 adb 等孤儿进程残留，C2）。
    /// 幂等：重复 Dispose（进程对象已释放）不抛。
    /// </summary>
    public ValueTask DisposeAsync()
    {
        try
        {
            if (!_process.HasExited)
                Kill();
        }
        catch
        {
            // 已释放/已退出则忽略
        }
        _process.Dispose();
        return ValueTask.CompletedTask;
    }
}

/// <summary>
/// 长驻进程实现 — 无输出消费（外置工具自带 UI），显式 Kill/Dispose。
/// </summary>
internal sealed class LongRunningProcess : ILongRunningProcess
{
    private readonly Process _process;

    public LongRunningProcess(Process process)
    {
        _process = process;
        _process.Exited += (_, _) => Exited?.Invoke(this, EventArgs.Empty);
    }

    public int Id => _process.Id;
    public bool IsRunning => !_process.HasExited;
    public event EventHandler? Exited;

    public async Task WaitForExitAsync(CancellationToken ct = default)
        => await _process.WaitForExitAsync(ct);

    public void Kill() => Kill(killTree: true);

    public void Kill(bool killTree)
    {
        try
        {
            _process.Kill(killTree);
        }
        catch
        {
            // 已退出则忽略
        }
    }

    /// <summary>释放：未退出则杀树（C2）；幂等（重复 Dispose 不抛）</summary>
    public ValueTask DisposeAsync()
    {
        try
        {
            if (!_process.HasExited)
                Kill();
        }
        catch
        {
            // 已释放/已退出则忽略
        }
        _process.Dispose();
        return ValueTask.CompletedTask;
    }
}
