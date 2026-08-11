using System.Threading.Channels;
using Yovo.Modules.LogAnalyzer.Application;
using Yovo.Platform.Abstractions.Adb;
using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Logging;
using Yovo.Platform.Abstractions.Process;
using Xunit;

namespace Yovo.Modules.LogAnalyzer.Tests;

/// <summary>采集服务：启停重启（C1 世代替换）/ 缓冲 / 停止关闭通道</summary>
public class LogcatCaptureServiceTests
{
    private static readonly DeviceSerial Serial = new("V2361A");

    [Fact]
    public async Task Start_Stop_Start_restarts_line_stream_generation()
    {
        var streaming = new FakeStreamingExecutor();
        FakeStreamingProcess? current = null;
        streaming.Handler = (_, _, _) => Task.FromResult<IStreamingProcess>(current = new FakeStreamingProcess());
        var service = new LogcatCaptureService(streaming, new SilentLog());

        // 第一轮采集
        await service.StartAsync(Serial);
        var generation1 = service.Lines;
        Assert.True(service.IsCapturing);
        current!.Emit("08-11 10:00:00.000  1  1 I Tag: one");
        var line1 = await generation1.ReadAsync();
        Assert.Equal("one", line1.Message);

        // 停止：通道关闭
        service.Stop();
        Assert.False(service.IsCapturing);
        await Assert.ThrowsAsync<ChannelClosedException>(async () => await generation1.ReadAsync());

        // 第二轮（C1：重启后行流恢复，新世代）
        await service.StartAsync(Serial);
        var generation2 = service.Lines;
        Assert.True(service.IsCapturing);
        Assert.NotSame(generation1, generation2);
        current!.Emit("08-11 10:00:01.000  1  1 I Tag: two");
        var line2 = await generation2.ReadAsync();
        Assert.Equal("two", line2.Message);

        service.Stop();
    }

    [Fact]
    public async Task Buffer_accumulates_and_snapshots_parsed_lines()
    {
        var streaming = new FakeStreamingExecutor();
        FakeStreamingProcess? current = null;
        streaming.Handler = (_, _, _) => Task.FromResult<IStreamingProcess>(current = new FakeStreamingProcess());
        var service = new LogcatCaptureService(streaming, new SilentLog());

        await service.StartAsync(Serial);
        current!.Emit("08-11 10:00:00.000  1  1 I Tag: a");
        current!.Emit("garbage line that fails parse");
        current!.Emit("08-11 10:00:01.000  2  2 E Tag: b");
        await Task.Delay(200); // 等待消费循环写入缓冲

        var snapshot = service.BufferSnapshot();
        Assert.Equal(2, snapshot.Count);
        Assert.Equal("a", snapshot[0].Message);
        Assert.Equal("E", snapshot[1].Level);

        service.Stop();
    }

    [Fact]
    public async Task Stop_then_immediate_start_old_finally_does_not_harm_new_generation()
    {
        // P0-1：Stop 后立即 Start；旧 ConsumeLoop 的 finally 晚到 —
        // 不得关闭新世代通道、不得误清采集状态、不得误触发 CaptureStopped
        var streaming = new FakeStreamingExecutor();
        FakeStreamingProcess? current = null;
        streaming.Handler = (_, _, _) => Task.FromResult<IStreamingProcess>(current = new FakeStreamingProcess());
        var service = new LogcatCaptureService(streaming, new SilentLog());
        var stoppedEvents = 0;
        service.CaptureStopped += () => stoppedEvents++;

        await service.StartAsync(Serial);
        var generation1 = service.Lines;

        service.Stop();
        await service.StartAsync(Serial); // 立即重启（新世代）
        var generation2 = service.Lines;
        Assert.NotSame(generation1, generation2);

        // 等旧循环 finally 执行（旧进程 Kill 后其 Output 流结束）
        await Task.Delay(300);

        // 新世代通道未被误关：仍可读取
        current!.Emit("08-11 10:00:00.000  1  1 I Tag: alive");
        var line = await generation2.ReadAsync();
        Assert.Equal("alive", line.Message);

        // 新世代仍在采集；CaptureStopped 未被旧 finally 误触发
        Assert.True(service.IsCapturing);
        Assert.Equal(0, stoppedEvents);

        service.Stop();
    }

    [Fact]
    public async Task Start_failure_rolls_back_generation_and_allows_retry()
    {
        // P0-2：启动失败回滚（通道完成 + 恢复空闲）— Drain 不卡死，重试可用
        var streaming = new FakeStreamingExecutor();
        var failFirst = true;
        streaming.Handler = (_, _, _) =>
        {
            if (failFirst)
            {
                failFirst = false;
                return Task.FromException<IStreamingProcess>(new InvalidOperationException("adb 不可用"));
            }
            return Task.FromResult<IStreamingProcess>(new FakeStreamingProcess());
        };
        var service = new LogcatCaptureService(streaming, new SilentLog());

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.StartAsync(Serial));
        Assert.False(service.IsCapturing);

        // 失败后行流通道已完成（Drain 可续接下一世代，不永久卡死）
        var reader = service.Lines;
        await Assert.ThrowsAsync<ChannelClosedException>(async () => await reader.ReadAsync());

        // 重试成功
        await service.StartAsync(Serial);
        Assert.True(service.IsCapturing);

        service.Stop();
    }

    [Fact]
    public async Task Start_is_idempotent_while_capturing()
    {
        var streaming = new FakeStreamingExecutor();
        var callCount = 0;
        streaming.Handler = (_, _, _) =>
        {
            callCount++;
            return Task.FromResult<IStreamingProcess>(new FakeStreamingProcess());
        };
        var service = new LogcatCaptureService(streaming, new SilentLog());

        await service.StartAsync(Serial);
        await service.StartAsync(Serial); // 已在采集：忽略
        Assert.Equal(1, callCount);

        service.Stop();
    }

    // ==================== 测试支撑 ====================

    private sealed class FakeStreamingExecutor : IAdbStreamingExecutor
    {
        public Func<DeviceSerial?, string, CancellationToken, Task<IStreamingProcess>>? Handler;

        public Task<IStreamingProcess> ExecuteStreamingAsync(DeviceSerial? serial, string adbArgs, CancellationToken ct = default)
            => Handler?.Invoke(serial, adbArgs, ct)
               ?? throw new InvalidOperationException("未配置 Handler");
    }

    private sealed class FakeStreamingProcess : IStreamingProcess
    {
        private readonly Channel<ProcessOutputChunk> _channel = Channel.CreateUnbounded<ProcessOutputChunk>();
        private readonly TaskCompletionSource _exited = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public IAsyncEnumerable<ProcessOutputChunk> Output
            => _channel.Reader.ReadAllAsync();

        public void Emit(string line)
            => _channel.Writer.TryWrite(ProcessOutputChunk.StdOut(line));

        public async Task<int> WaitForExitAsync(CancellationToken ct = default)
        {
            await _exited.Task.WaitAsync(ct);
            return 0;
        }

        public void Kill()
        {
            _channel.Writer.TryComplete();
            _exited.TrySetResult();
        }

        public ValueTask DisposeAsync()
        {
            Kill();
            return ValueTask.CompletedTask;
        }
    }

    private sealed class SilentLog : IAppLog
    {
        public void Write(AppLogLevel level, string message, string source = "", IReadOnlyDictionary<string, string>? tags = null) { }
        public void Info(string message, string source = "", IReadOnlyDictionary<string, string>? tags = null) { }
        public void Warn(string message, string source = "", IReadOnlyDictionary<string, string>? tags = null) { }
        public void Error(string message, string source = "", IReadOnlyDictionary<string, string>? tags = null) { }
        public IDisposable Subscribe(AppLogFilter? filter, Action<AppLogEntry> handler) => new Noop();
        public IReadOnlyList<AppLogEntry> Snapshot(AppLogFilter? filter = null, int max = 2000) => [];

        private sealed class Noop : IDisposable
        {
            public void Dispose() { }
        }
    }
}
