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
        // 修改时间（Android toybox: yyyy-MM-dd HH:mm）
        Assert.Equal(new DateTime(2026, 8, 11, 10, 0, 0), data.Modified!.Value.DateTime);
        Assert.Equal(new DateTime(2026, 8, 11, 10, 0, 0), entries[0].Modified!.Value.DateTime);
        // 含空格文件名
        Assert.NotNull(entries.FirstOrDefault(e => e.Name == "with space.txt"));
    }

    [Fact]
    public async Task ListAsync_parses_real_device_output()
    {
        // 真实设备 ls -la /sdcard/ 输出（V2361A，2026-08-12 抓取）
        const string output = """
        total 538421
        drwxrws---  5 u0_a0    media_rw      3452 2026-07-29 18:29 .BBKAppStore
        -rwxrwxr-x  1 media_rw media_rw       308 2026-06-16 07:23 .clear_sdcard.ini
        drwxrws---  3 u0_a0    media_rw      3452 2025-12-17 11:02 .dwd
        drwxrws---  3 u0_a0    media_rw      3452 2026-07-06 18:03 .networkstate
        -rw-rw----  1 media_rw media_rw     12345 2026-08-11 10:00 normal file.txt
        """;
        var service = new RemoteFileService(new FakeAdbExecutor(Result(output, 0)));

        var entries = await service.ListAsync(Serial, new RemotePath("/sdcard"));

        Assert.Equal(5, entries.Count);
        Assert.Equal(".BBKAppStore", entries[0].Name);
        Assert.True(entries[0].IsDirectory);
        Assert.Equal(12345, entries.First(e => e.Name == "normal file.txt").Size);
        Assert.False(entries.First(e => e.Name == ".clear_sdcard.ini").IsDirectory);
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
    public async Task ListAsync_uses_trailing_slash_path()
    {
        // ls 无尾斜杠时输出符号链接本身而非目录内容（/sdcard -> /storage/self/primary）
        string? receivedArgs = null;
        var service = new RemoteFileService(new FakeAdbExecutor((_, args) =>
        {
            receivedArgs = args;
            return Result("total 1", 0);
        }));

        await service.ListAsync(Serial, new RemotePath("/sdcard"));
        Assert.Equal("shell ls -la '/sdcard/'", receivedArgs);

        // 根目录：TrimEnd('/') 后补斜杠仍为 "/"
        await service.ListAsync(Serial, new RemotePath("/"));
        Assert.Equal("shell ls -la '/'", receivedArgs);
    }

    [Fact]
    public async Task ListAsync_symlink_only_output_yields_empty_list()
    {
        // 旧行为回归保护：无尾斜杠时设备只回符号链接行（name 含 / 被安全跳过 → 0 项）
        // 新行为已带尾斜杠；此测试保护解析器对符号链接行的防御
        const string output = "lrw-r--r-- 1 root root 21 2009-01-01 08:00 /sdcard -> /storage/self/primary\n";
        var service = new RemoteFileService(new FakeAdbExecutor(Result(output, 0)));

        var entries = await service.ListAsync(Serial, new RemotePath("/sdcard"));

        Assert.Empty(entries); // 不崩溃、不产生伪条目
    }

    [Fact]
    public async Task ListAsync_parses_modified_with_fallback_formats()
    {
        // 非 toybox 格式：MM-dd HH:mm（当年）与 MM-dd yyyy（老文件）兼容
        const string output = """
        -rw-rw----  1 root sdcard_rw   100 08-11 10:00 recent.bin
        -rw-rw----  1 root sdcard_rw   100 12-17 11:02 old.bin
        -rw-rw----  1 root sdcard_rw   100 08-11 2025 year.bin
        """;
        var service = new RemoteFileService(new FakeAdbExecutor(Result(output, 0)));

        var entries = await service.ListAsync(Serial, new RemotePath("/sdcard"));

        var recent = entries.First(e => e.Name == "recent.bin");
        Assert.Equal(DateTime.Today.Year, recent.Modified!.Value.Year); // 缺年份 → 当年
        Assert.Equal(new DateTime(DateTime.Today.Year, 8, 11, 10, 0, 0), recent.Modified!.Value.DateTime);
        var old = entries.First(e => e.Name == "old.bin");
        Assert.Equal(DateTime.Today.Year, old.Modified!.Value.Year);
        var year = entries.First(e => e.Name == "year.bin");
        Assert.Equal(new DateTime(2025, 8, 11, 0, 0, 0), year.Modified!.Value.DateTime);
    }

    [Fact]
    public async Task ListAsync_returns_null_modified_on_unparseable_date()
    {
        const string output = "-rw-rw----  1 root sdcard_rw   100 ??-?? ??:?? weird.bin\n";
        var service = new RemoteFileService(new FakeAdbExecutor(Result(output, 0)));

        var entries = await service.ListAsync(Serial, new RemotePath("/sdcard"));

        var weird = Assert.Single(entries);
        Assert.Null(weird.Modified); // 解析失败不崩溃、显示空
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
