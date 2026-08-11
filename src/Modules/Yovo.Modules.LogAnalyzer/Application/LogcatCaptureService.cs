using System.Threading.Channels;
using Yovo.Platform.Abstractions.Adb;
using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Logging;
using Yovo.Platform.Abstractions.Process;

namespace Yovo.Modules.LogAnalyzer.Application;

/// <summary>
/// logcat 采集服务 — 流式逐行解析 + 环形缓冲（默认 50k）+ 行流订阅。
/// 解析在读取循环内（后台线程）；UI 侧经 Channel 节流消费。
/// 可停止后再次启动：每次 Start 替换行流 Channel（世代），消费端循环取当前世代。
/// 严禁把 logcat 写入 IAppLog（ADR-006：应用日志与设备日志严格分离）。
/// </summary>
public class LogcatCaptureService(IAdbStreamingExecutor streaming, IAppLog log)
{
    private const int BufferCapacity = 50_000;

    private readonly object _lock = new();
    private readonly List<LogcatLine> _buffer = [];
    private Channel<LogcatLine> _lines = Channel.CreateUnbounded<LogcatLine>();
    private IStreamingProcess? _process;
    private CancellationTokenSource? _cts;

    /// <summary>是否正在采集</summary>
    public bool IsCapturing
    {
        get
        {
            lock (_lock)
                return _process is not null;
        }
    }

    /// <summary>当前世代行流（消费端节流读取；停止后该世代通道关闭，重新开始后取新世代）</summary>
    public ChannelReader<LogcatLine> Lines
    {
        get
        {
            lock (_lock)
                return _lines.Reader;
        }
    }

    /// <summary>采集进程退出（设备断开/被杀）</summary>
    public event Action? CaptureStopped;

    /// <summary>开始采集（幂等：已在采集则忽略；可停止后再次启动）</summary>
    public async Task StartAsync(DeviceSerial serial, CancellationToken ct = default)
    {
        lock (_lock)
        {
            if (_process is not null)
                return;
            _lines = Channel.CreateUnbounded<LogcatLine>(); // 新世代：旧通道已关闭，消费端循环续接
        }

        _cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var process = await streaming.ExecuteStreamingAsync(serial, "logcat -v threadtime", ct);
        lock (_lock)
            _process = process;
        _ = ConsumeLoopAsync(process, _cts.Token);
        log.Info($"logcat 采集已开始: {serial}", LogAnalyzerModule.ModuleId);
    }

    /// <summary>停止采集（Kill 进程 + 关闭当前世代通道；不清理缓冲）</summary>
    public void Stop()
    {
        IStreamingProcess? process;
        lock (_lock)
        {
            process = _process;
            _process = null;
        }
        process?.Kill();
        _cts?.Cancel();
        _cts?.Dispose();
        _cts = null;
        lock (_lock)
            _lines.Writer.TryComplete();
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
            await process.DisposeAsync();
            lock (_lock)
            {
                if (ReferenceEquals(_process, process))
                    _process = null;
                _lines.Writer.TryComplete();
            }
            CaptureStopped?.Invoke();
        }
    }
}
