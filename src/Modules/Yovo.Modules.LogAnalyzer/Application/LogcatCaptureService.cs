using System.Threading.Channels;
using Yovo.Platform.Abstractions.Adb;
using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Logging;
using Yovo.Platform.Abstractions.Process;

namespace Yovo.Modules.LogAnalyzer.Application;

/// <summary>
/// logcat 采集服务 — 流式逐行解析 + 环形缓冲（默认 50k）+ 行流订阅。
/// 解析在读取循环内（后台线程）；UI 侧经 Channel 节流消费。
/// 严禁把 logcat 写入 IAppLog（ADR-006：应用日志与设备日志严格分离）。
/// </summary>
public class LogcatCaptureService(IAdbStreamingExecutor streaming, IAppLog log)
{
    private const int BufferCapacity = 50_000;

    private readonly object _lock = new();
    private readonly List<LogcatLine> _buffer = [];
    private readonly Channel<LogcatLine> _lines = Channel.CreateUnbounded<LogcatLine>();
    private IStreamingProcess? _process;
    private CancellationTokenSource? _cts;

    /// <summary>是否正在采集</summary>
    public bool IsCapturing => _process is not null;

    /// <summary>行流（消费端节流读取；停止后通道关闭）</summary>
    public ChannelReader<LogcatLine> Lines => _lines.Reader;

    /// <summary>采集进程退出（设备断开/被杀）</summary>
    public event Action? CaptureStopped;

    /// <summary>开始采集（幂等：已在采集则忽略）</summary>
    public async Task StartAsync(DeviceSerial serial, CancellationToken ct = default)
    {
        if (IsCapturing)
            return;

        _cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var process = await streaming.ExecuteStreamingAsync(serial, "logcat -v threadtime", ct);
        _process = process;
        _ = ConsumeLoopAsync(process, _cts.Token);
        log.Info($"logcat 采集已开始: {serial}", LogAnalyzerModule.ModuleId);
    }

    /// <summary>停止采集（Kill 进程；不清理缓冲）</summary>
    public void Stop()
    {
        var process = _process;
        _process = null;
        process?.Kill();
        _cts?.Cancel();
        _cts?.Dispose();
        _cts = null;
    }

    /// <summary>缓冲快照（线程安全拷贝）</summary>
    public IReadOnlyList<LogcatLine> BufferSnapshot()
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

    private async Task ConsumeLoopAsync(IStreamingProcess process, CancellationToken ct)
    {
        try
        {
            await foreach (var chunk in process.Output.WithCancellation(ct))
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
                _lines.Writer.TryWrite(parsed);
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
            _lines.Writer.TryComplete();
            await process.DisposeAsync();
            _process = null;
            CaptureStopped?.Invoke();
        }
    }
}
