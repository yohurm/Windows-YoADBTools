using Yovo.Modules.FileManager.Application;
using Yovo.Modules.FileManager.Domain;
using Yovo.Platform.Abstractions.Adb;
using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Tasks;
using Yovo.Platform.Tasks;
using Xunit;

namespace Yovo.Modules.FileManager.Tests;

/// <summary>传输运行器：后台任务登记/进度/取消/完成清理</summary>
public class TransferRunnerTests
{
    private static readonly DeviceSerial Serial = new("V2361A");

    [Fact]
    public async Task Push_registers_task_and_completes_on_success()
    {
        var tasks = new BackgroundTaskCenter();
        var runner = new TransferRunner(new FakeTransfer(), tasks);

        await runner.RunAsync(Serial, TransferDirection.Push, @"C:\local\a.bin", new RemotePath("/sdcard/a.bin"));

        Assert.Empty(tasks.Active); // 完成后移出活跃列表
    }

    [Fact]
    public async Task Push_forwards_progress_to_ui()
    {
        var tasks = new BackgroundTaskCenter();
        var fake = new FakeTransfer { Progress = new[] { new TransferProgress(50, 100, 50.0) } };
        var runner = new TransferRunner(fake, tasks);
        var reported = new List<TransferProgress>();

        // Progress<T> 无 SynchronizationContext 时回调走线程池（异步竞态）— 用同步 IProgress 替代
        await runner.RunAsync(Serial, TransferDirection.Push, "a.bin", new RemotePath("/sdcard/a.bin"),
            new SyncProgress<TransferProgress>(reported.Add));

        Assert.Single(reported);
        Assert.Equal(50.0, reported[0].Percent);
    }

    [Fact]
    public async Task Cancel_marks_task_canceled_and_propagates()
    {
        var tasks = new BackgroundTaskCenter();
        var runner = new TransferRunner(new FakeTransfer { Delay = TimeSpan.FromSeconds(30) }, tasks);
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(100));

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            runner.RunAsync(Serial, TransferDirection.Pull, @"C:\local\a.bin", new RemotePath("/sdcard/a.bin"), ct: cts.Token));

        Assert.Empty(tasks.Active); // 取消后任务已清理
    }

    [Fact]
    public async Task Failure_marks_task_and_propagates()
    {
        var tasks = new BackgroundTaskCenter();
        var runner = new TransferRunner(new FakeTransfer { Fail = true }, tasks);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            runner.RunAsync(Serial, TransferDirection.Push, "a.bin", new RemotePath("/sdcard/a.bin")));

        Assert.Empty(tasks.Active);
    }

    // ==================== 测试支撑 ====================

    /// <summary>同步 IProgress（避免 Progress&lt;T&gt; 线程池异步回调竞态）</summary>
    private sealed class SyncProgress<T>(Action<T> action) : IProgress<T>
    {
        public void Report(T value) => action(value);
    }

    private sealed class FakeTransfer : IAdbTransfer
    {
        public TimeSpan Delay { get; set; } = TimeSpan.Zero;
        public bool Fail { get; set; }
        public IReadOnlyList<TransferProgress>? Progress { get; set; }

        public async Task PushAsync(DeviceSerial serial, string localPath, string remotePath,
            IProgress<TransferProgress>? progress = null, CancellationToken ct = default)
        {
            await RunAsync(progress, ct);
        }

        public async Task PullAsync(DeviceSerial serial, string remotePath, string localPath,
            IProgress<TransferProgress>? progress = null, CancellationToken ct = default)
        {
            await RunAsync(progress, ct);
        }

        private async Task RunAsync(IProgress<TransferProgress>? progress, CancellationToken ct)
        {
            if (Delay > TimeSpan.Zero)
                await Task.Delay(Delay, ct);
            ct.ThrowIfCancellationRequested();
            if (Progress is not null)
            {
                foreach (var p in Progress)
                    progress?.Report(p);
            }
            if (Fail)
                throw new InvalidOperationException("adb push 失败");
        }

        public Task<IDisposable> ForwardAsync(DeviceSerial serial, string local, string remote, CancellationToken ct = default)
            => throw new NotSupportedException();

        public Task<IDisposable> ReverseAsync(DeviceSerial serial, string remote, string local, CancellationToken ct = default)
            => throw new NotSupportedException();
    }
}
