using Yovo.Modules.FileManager.Application;
using Yovo.Modules.FileManager.Domain;
using Yovo.Platform.Abstractions.Adb;
using Yovo.Platform.Abstractions.Devices;
using Xunit;

namespace Yovo.Modules.FileManager.Tests;

/// <summary>远程文件服务：ls 解析 / 命令构造 / 失败语义（fake executor）</summary>
public class RemoteFileServiceTests
{
    private static readonly DeviceSerial Serial = new("V2361A");

    [Fact]
    public async Task ListAsync_parses_ls_la_output()
    {
        const string output = """
        total 44
        drwxrwx---  2 root sdcard_rw  4096 2026-08-11 10:00 Android
        -rw-rw----  1 root sdcard_rw  1234 2026-08-11 10:00 data.bin
        drwxrwx---  2 root sdcard_rw  4096 2026-08-11 10:00 Download
        -rw-rw----  1 root sdcard_rw   100 2026-08-11 10:00 with space.txt
        """;
        var service = new RemoteFileService(new FakeAdbExecutor(Result(output, 0)));

        var entries = await service.ListAsync(Serial, new RemotePath("/sdcard"));

        Assert.Equal(4, entries.Count);
        // 目录优先排序
        Assert.Equal("Android", entries[0].Name);
        Assert.True(entries[0].IsDirectory);
        Assert.Equal("/sdcard/Android", entries[0].Path.Value);
        Assert.Equal("Download", entries[1].Name);
        // 文件带大小
        var data = entries.First(e => e.Name == "data.bin");
        Assert.False(data.IsDirectory);
        Assert.Equal(1234, data.Size);
        Assert.Equal("/sdcard/data.bin", data.Path.Value);
        // 含空格文件名
        Assert.NotNull(entries.FirstOrDefault(e => e.Name == "with space.txt"));
    }

    [Fact]
    public async Task ListAsync_skips_current_and_parent_entries()
    {
        const string output = """
        drwxr-xr-x 1 root root 4096 2026-08-11 10:00 .
        drwxr-xr-x 1 root root 4096 2026-08-11 10:00 ..
        drwxr-xr-x 1 root root 4096 2026-08-11 10:00 real
        """;
        var service = new RemoteFileService(new FakeAdbExecutor(Result(output, 0)));

        var entries = await service.ListAsync(Serial, new RemotePath("/sdcard"));

        Assert.Single(entries);
        Assert.Equal("real", entries[0].Name);
    }

    [Fact]
    public async Task ListAsync_throws_on_nonzero_exit()
    {
        var service = new RemoteFileService(new FakeAdbExecutor(Result("Permission denied", 1)));

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => service.ListAsync(Serial, new RemotePath("/system")));
    }

    [Fact]
    public async Task Delete_uses_rm_rf_with_quoted_path()
    {
        string? receivedArgs = null;
        var service = new RemoteFileService(new FakeAdbExecutor((_, args) =>
        {
            receivedArgs = args;
            return Result("", 0);
        }));

        await service.DeleteAsync(Serial, new RemotePath("/sdcard/data.bin"));

        Assert.Equal("shell rm -rf '/sdcard/data.bin'", receivedArgs);
    }

    [Fact]
    public async Task CreateDirectory_uses_mkdir_p()
    {
        string? receivedArgs = null;
        var service = new RemoteFileService(new FakeAdbExecutor((_, args) =>
        {
            receivedArgs = args;
            return Result("", 0);
        }));

        await service.CreateDirectoryAsync(Serial, new RemotePath("/sdcard/new dir"));

        Assert.Equal("shell mkdir -p '/sdcard/new dir'", receivedArgs);
    }

    // ==================== 测试支撑 ====================

    private static AdbTextResult Result(string output, int exitCode)
        => new(output, string.Empty, exitCode, 10);

    private sealed class FakeAdbExecutor : IAdbCommandExecutor
    {
        private readonly Func<DeviceSerial?, string, AdbTextResult>? _handler;
        private readonly AdbTextResult? _fixed;

        public FakeAdbExecutor(AdbTextResult fixedResult) => _fixed = fixedResult;

        public FakeAdbExecutor(Func<DeviceSerial?, string, AdbTextResult> handler) => _handler = handler;

        public Task<AdbTextResult> ExecuteAsync(DeviceSerial? serial, string adbArgs,
            TimeSpan? timeout = null, CancellationToken ct = default)
            => Task.FromResult(_handler?.Invoke(serial, adbArgs) ?? _fixed!);
    }
}
