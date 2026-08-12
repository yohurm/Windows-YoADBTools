using System.Threading.Channels;
using Yovo.Platform.Abstractions.Adb;
using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Logging;
using Yovo.Platform.Abstractions.Process;
using Yovo.Platform.Abstractions.Settings;

namespace Yovo.Modules.LogAnalyzer.Application;

/// <summary>
/// logcat 采集服务 — 流式逐行解析 + 环形缓冲（默认 50k）+ 行流订阅。
/// 世代状态机（复审 P0-1/P0-2/P2-3）：
///   一次 Start 产生一个 CaptureGeneration（Channel + 进程 + CTS 绑定）；
///   消费循环只操作本世代 Channel，finally 仅当仍是当前世代才清状态/触发 CaptureStopped；
///   Start 失败回滚（完成世代通道 + 恢复空闲），Drain 可续接下一世代；
///   锁内检查+设置防并发双进程。
/// 严禁把 logcat 写入 IAppLog（ADR-006：应用日志与设备日志严格分离）。
/// </summary>
public class LogcatCaptureService(
    IAdbStreamingExecutor streaming,
    IAppLog log,
    ISettingsStore? settings = null)
{
    public const string BufferCapacityKey = "buffer.capacity";
    private const int DefaultBufferCapacity = 50_000;

    private int BufferCapacity => Math.Clamp(
        settings?.Get(SettingsScope.Module(LogAnalyzerModule.ModuleId), BufferCapacityKey, DefaultBufferCapacity)
            ?? DefaultBufferCapacity,
        1_000, 500_000);

    /// <summary>一次采集的全量状态（世代绑定，防止旧循环污染新世代）</summary>
    private sealed class CaptureGeneration
    {
        public required Channel<LogcatLine> Lines;
        public required CancellationTokenSource Cts;
        public required IStreamingProcess Process;
    }

    private static readonly Channel<LogcatLine> CompletedChannel = CreateCompletedChannel();

    private readonly object _lock = new();
    private readonly List<LogcatLine> _buffer = [];
    private CaptureGeneration? _generation;

    /// <summary>是否正在采集</summary>
    public bool IsCapturing
    {
        get
        {
            lock (_lock)
                return _generation is not null;
        }
    }

    /// <summary>当前世代行流（无世代返回已完成通道 — Drain 循环可立即续接下个世代）</summary>
    public ChannelReader<LogcatLine> Lines
    {
        get
        {
            lock (_lock)
                return (_generation?.Lines ?? CompletedChannel).Reader;
        }
    }

    /// <summary>采集进程退出（当前世代停止 — 旧世代晚到不误伤，P0-1）</summary>
    public event Action? CaptureStopped;

    /// <summary>开始采集（锁内检查+设置防并发双进程；Start 失败回滚世代，P0-2）</summary>
    public async Task StartAsync(DeviceSerial serial, CancellationToken ct = default)
    {
        CaptureGeneration generation;
        lock (_lock)
        {
            if (_generation is not null)
                return; // 已在采集：忽略（并发 Start 只允许一个进程，P2-3）
            generation = new CaptureGeneration
            {
                Lines = Channel.CreateUnbounded<LogcatLine>(),
                Cts = CancellationTokenSource.CreateLinkedTokenSource(ct),
                Process = null! // await 成功后赋值
            };
            _generation = generation;
        }

        try
        {
            generation.Process = await streaming.ExecuteStreamingAsync(serial, "logcat -v threadtime", generation.Cts.Token);
            _ = ConsumeLoopAsync(generation);
            log.Info($"logcat 采集已开始: {serial}", LogAnalyzerModule.ModuleId);
        }
        catch
        {
            // P0-2：启动失败回滚 — 完成世代通道（Drain 可续接下一世代）+ 恢复空闲
            lock (_lock)
            {
                if (ReferenceEquals(_generation, generation))
                    _generation = null;
            }
            generation.Lines.Writer.TryComplete();
            generation.Cts.Dispose();
            throw;
        }
    }

    /// <summary>停止采集（Kill 进程 + 关闭当前世代通道；不清理缓冲）</summary>
    public void Stop()
    {
        CaptureGeneration? generation;
        lock (_lock)
        {
            generation = _generation;
            _generation = null;
        }
        if (generation is null)
            return;
        generation.Process.Kill();
        generation.Cts.Cancel();
        generation.Lines.Writer.TryComplete();
        generation.Cts.Dispose();
    }

    /// <summary>缓冲快照（线程安全拷贝；virtual 供测试替身）</summary>
    public virtual IReadOnlyList<LogcatLine> BufferSnapshot()
    {
        lock (_lock)
            return _buffer.ToList();
    }

    /// <summary>清空缓冲</summary>
    public void ClearBuffer()
    {
        lock (_lock)
            _buffer.Clear();
    }

    // ==================== 内部 ====================

    private async Task ConsumeLoopAsync(CaptureGeneration generation)
    {
        try
        {
            await foreach (var chunk in generation.Process.Output.WithCancellation(generation.Cts.Token))
            {
                var line = chunk.StandardOutput ?? chunk.StandardError;
                if (line is null)
                    continue;

                var parsed = LogcatParser.Parse(line);
                if (parsed is null)
                    continue;

                lock (_lock)
                {
                    _buffer.Add(parsed);
                    if (_buffer.Count > BufferCapacity)
                        _buffer.RemoveRange(0, _buffer.Count - BufferCapacity); // 环形裁剪
                }
                generation.Lines.Writer.TryWrite(parsed); // 只写本世代（P0-1）
            }
        }
        catch (OperationCanceledException)
        {
            // 正常停止
        }
        catch (Exception ex)
        {
            log.Error($"logcat 读取中断: {ex.Message}", LogAnalyzerModule.ModuleId);
        }
        finally
        {
            await generation.Process.DisposeAsync();
            generation.Lines.Writer.TryComplete(); // 只关本世代（P0-1）

            // 仅当仍是当前世代才清状态 + 通知（旧循环晚到不误伤新一轮，P0-1）
            var wasCurrent = false;
            lock (_lock)
            {
                if (ReferenceEquals(_generation, generation))
                {
                    _generation = null;
                    wasCurrent = true;
                }
            }
            generation.Cts.Dispose();
            if (wasCurrent)
                CaptureStopped?.Invoke();
        }
    }

    private static Channel<LogcatLine> CreateCompletedChannel()
    {
        var channel = Channel.CreateUnbounded<LogcatLine>();
        channel.Writer.TryComplete();
        return channel;
    }
}
