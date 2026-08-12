using System.Text;

namespace Yovo.Platform.Abstractions.Process;

/// <summary>进程启动规格 — 全部参数收敛于此 record</summary>
public sealed record ProcessSpec(
    string FileName,
    string Arguments,
    string? WorkingDirectory = null,
    IReadOnlyDictionary<string, string>? Environment = null,
    Encoding? StdOutEncoding = null,
    Encoding? StdErrEncoding = null,
    TimeSpan? Timeout = null,                 // 仅对 RunAsync 有意义；长驻进程必须为 null
    bool KillTreeOnCancel = true);

/// <summary>短命令结果（纯原始输出，不做成败判定 — 判定是模块领域规则）</summary>
public sealed record ProcessResult(
    string Output,
    string Error,
    int ExitCode,
    long ElapsedMs);

/// <summary>流式输出块（一行 stdout 或 stderr；不携带 UI 语义）</summary>
public sealed record ProcessOutputChunk(string? StandardOutput, string? StandardError)
{
    public static ProcessOutputChunk StdOut(string line) => new(line, null);
    public static ProcessOutputChunk StdErr(string line) => new(null, line);
}

/// <summary>流式进程 — 逐行消费输出（logcat 等大输出场景）</summary>
public interface IStreamingProcess : IAsyncDisposable
{
    /// <summary>输出流（枚举即消费；进程退出后流结束）</summary>
    IAsyncEnumerable<ProcessOutputChunk> Output { get; }

    Task<int> WaitForExitAsync(CancellationToken ct = default);

    /// <summary>强杀进程（含子进程树）</summary>
    void Kill();
}

/// <summary>长驻进程 — 后台常驻，无默认超时，显式 Stop/Kill</summary>
public interface ILongRunningProcess : IAsyncDisposable
{
    int Id { get; }
    bool IsRunning { get; }
    event EventHandler? Exited;
    Task WaitForExitAsync(CancellationToken ct = default);
    void Kill();
}

/// <summary>
/// 进程运行器 — 平台内核能力中枢。
/// 短命令 RunAsync（可超时）；大输出 StartStreamingAsync；长驻 StartLongRunningAsync（禁止超时）。
/// 取消语义统一：KillTreeOnCancel 默认 true（adb 进程会衍生 shell 子进程，必须连根杀）。
/// StartLongRunningAsync 预留：当前无业务调用方（投屏立项后消费，G-P1-6）；勿扩无主 API。
/// </summary>
public interface IProcessRunner
{
    /// <summary>全缓冲执行，等待退出。超时抛 TimeoutException，取消抛 OperationCanceledException</summary>
    Task<ProcessResult> RunAsync(ProcessSpec spec, CancellationToken ct = default);

    /// <summary>启动流式进程（取消 = Kill）</summary>
    Task<IStreamingProcess> StartStreamingAsync(ProcessSpec spec, CancellationToken ct = default);

    /// <summary>启动长驻进程（取消不自动 Kill — 调用方显式 Stop/Kill）</summary>
    Task<ILongRunningProcess> StartLongRunningAsync(ProcessSpec spec, CancellationToken ct = default);
}
