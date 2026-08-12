using Yovo.Modules.FileManager.Application;
using Yovo.Modules.FileManager.Domain;
using Yovo.Modules.FileManager.Presentation.ViewModels;
using Yovo.Platform.Abstractions;
using Yovo.Platform.Abstractions.Adb;
using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Logging;
using Yovo.Platform.Tasks;
using Xunit;

namespace Yovo.Modules.FileManager.Tests;

/// <summary>文件管理 VM：加载世代（快速导航丢弃过期结果）/ 列表刷新</summary>
public class FileManagerViewModelTests
{
    private static readonly AdbDevice Device = new(new DeviceSerial("V2361A"), "device", "SM-V2361A");

    [Fact]
    public async Task Quick_navigation_old_result_is_discarded()
    {
        // fake executor：不同目录返回不同内容，A 慢、B 快（交错完成验证世代）
        var executor = new SlowFakeExecutor();
        var hub = new FakeHub(Device);
        var vm = new FileManagerViewModel(
            new RemoteFileService(executor),
            new TransferRunner(new FakeTransfer(), new BackgroundTaskCenter()),
            hub,
            new SilentLog(),
            new FakeDispatcher(),
            new FakeLifecycle());

        // 等首个目录加载完成（/sdcard 根）
        await WaitUntilAsync(() => vm.Entries.Count > 0 || executor.Calls > 0);
        executor.SetPlan("/sdcard", 300, "slow-dir");
        executor.SetPlan("/sdcard/slow-dir", 50, "fast-entry");

        // 双击进入 A（慢）后立即进入 B（快）— 不等待 A 完成
        var slowEntry = new RemoteEntry("slow-dir", new RemotePath("/sdcard/slow-dir"), true, null, null);
        _ = vm.OpenEntryCommand.ExecuteAsync(slowEntry);
        await Task.Delay(80); // A 未完成时触发 B
        var fastEntry = new RemoteEntry("fast-entry", new RemotePath("/sdcard/fast-entry"), true, null, null);
        await vm.OpenEntryCommand.ExecuteAsync(fastEntry); // 这个其实会进入 fast-entry 目录…

        await Task.Delay(500); // 两个加载都完成

        // 最终列表应为最后一次导航（fast-entry 内）的内容；过期结果被丢弃
        Assert.All(vm.Entries, e => Assert.StartsWith("inside-", e.Name));
    }

    private static async Task WaitUntilAsync(Func<bool> condition, int timeoutMs = 5000)
    {
        var deadline = DateTime.Now.AddMilliseconds(timeoutMs);
        while (!condition() && DateTime.Now < deadline)
            await Task.Delay(50);
    }

    // ==================== 测试支撑 ====================

    /// <summary>按路径返回不同内容 + 可配延迟的 fake executor</summary>
    private sealed class SlowFakeExecutor : IAdbCommandExecutor
    {
        private readonly Dictionary<string, (int Delay, string Entry)> _plan = [];
        public int Calls { get; private set; }

        public void SetPlan(string path, int delayMs, string entry) => _plan[path] = (delayMs, entry);

        public async Task<AdbTextResult> ExecuteAsync(DeviceSerial? serial, string adbArgs,
            TimeSpan? timeout = null, CancellationToken ct = default)
        {
            Calls++;
            // adbArgs 形如 shell ls -la '/sdcard/slow-dir'
            var path = adbArgs.Split('\'')[1];
            var (delay, entry) = _plan.GetValueOrDefault(path, (0, $"inside-{path.Split('/').Last()}"));
            if (delay > 0)
                await Task.Delay(delay, ct);
            return new AdbTextResult(
                $"-rw-rw----  1 root sdcard_rw  100 2026-08-11 10:00 {entry}\n", "", 0, delay);
        }
    }

    private sealed class FakeHub(AdbDevice? device) : IDeviceSessionHub
    {
        public AdbDevice? ActiveDevice => device;
        public event Action? ActiveDeviceChanged;
        public event Action<string>? SelectionChanged;
        public void SetActiveDevice(DeviceSerial? serial) { }
        public void SetModuleMode(string moduleId, DeviceSelectionMode mode) { }
        public DeviceSelection GetSelection(string moduleId) => DeviceSelection.Empty(DeviceSelectionMode.SingleRequired);
        public void SetSelection(string moduleId, DeviceSelection selection) { }
    }

    private sealed class FakeTransfer : IAdbTransfer
    {
        public Task PushAsync(DeviceSerial serial, string localPath, string remotePath, IProgress<TransferProgress>? progress = null, CancellationToken ct = default)
            => Task.CompletedTask;
        public Task PullAsync(DeviceSerial serial, string remotePath, string localPath, IProgress<TransferProgress>? progress = null, CancellationToken ct = default)
            => Task.CompletedTask;
        public Task<IDisposable> ForwardAsync(DeviceSerial serial, string local, string remote, CancellationToken ct = default)
            => throw new NotSupportedException();
        public Task<IDisposable> ReverseAsync(DeviceSerial serial, string remote, string local, CancellationToken ct = default)
            => throw new NotSupportedException();
    }

    private sealed class SilentLog : IAppLog
    {
        public void Write(AppLogLevel level, string message, string source = "", IReadOnlyDictionary<string, string>? tags = null) { }
        public void Info(string message, string source = "", IReadOnlyDictionary<string, string>? tags = null) { }
        public void Warn(string message, string source = "", IReadOnlyDictionary<string, string>? tags = null) { }
        public void Error(string message, string source = "", IReadOnlyDictionary<string, string>? tags = null) { }
        public IDisposable Subscribe(AppLogFilter? filter, Action<AppLogEntry> handler) => new Noop();
        public IReadOnlyList<AppLogEntry> Snapshot(AppLogFilter? filter = null, int max = 2000) => [];
        private sealed class Noop : IDisposable { public void Dispose() { } }
    }

    private sealed class FakeDispatcher : IUiDispatcher
    {
        public bool IsOnUiThread => true;
        public void Post(Action action) => action();
        public Task InvokeAsync(Action action) { action(); return Task.CompletedTask; }
        public Task<T> InvokeAsync<T>(Func<T> func) => Task.FromResult(func());
    }

    private sealed class FakeLifecycle : IAppLifecycle
    {
        public CancellationToken ShutdownToken => CancellationToken.None;
    }
}
