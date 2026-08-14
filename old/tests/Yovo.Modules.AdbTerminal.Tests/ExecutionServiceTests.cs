using Yovo.Modules.AdbTerminal.Application;
using Yovo.Modules.AdbTerminal.Domain;
using Yovo.Platform.Abstractions.Adb;
using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Logging;
using Xunit;

namespace Yovo.Modules.AdbTerminal.Tests;

/// <summary>执行引擎：占位符替换 / 输入校验 / 深拷贝 / 超时与取消语义</summary>
public class ExecutionServiceTests
{
    private static readonly DeviceSerial Serial = new("V2361A");

    [Fact]
    public async Task Execute_replaces_placeholders_with_inputs()
    {
        var fake = new FakeAdbExecutor();
        string? receivedArgs = null;
        fake.Handler = (_, args) =>
        {
            receivedArgs = args;
            return Task.FromResult(Result("done", exitCode: 0));
        };
        var service = new ExecutionService(fake, new SilentLog());

        var cmd = new CommandDefinition { Name = "写号", Command = "shell bdft write -sn {0}", InputPrompts = ["SN"] };
        var result = await service.ExecuteAsync(Serial, cmd, ["ABC123"]);

        Assert.True(result.Success);
        Assert.Equal("shell bdft write -sn ABC123", receivedArgs);
    }

    [Fact]
    public async Task Execute_missing_input_returns_invalid_input()
    {
        var service = new ExecutionService(new FakeAdbExecutor(), new SilentLog());
        var cmd = new CommandDefinition { Name = "需要输入", Command = "shell echo {0}", InputPrompts = ["值"] };

        var result = await service.ExecuteAsync(Serial, cmd, inputs: null);

        Assert.False(result.Success);
        Assert.Equal(ResultSource.InvalidInput, result.Source);
    }

    [Fact]
    public async Task Execute_input_count_mismatch_rejected()
    {
        var service = new ExecutionService(new FakeAdbExecutor(), new SilentLog());
        var cmd = new CommandDefinition { Name = "双参数", Command = "shell echo {0} {1}", InputPrompts = ["a", "b"] };

        var result = await service.ExecuteAsync(Serial, cmd, ["only-one"]);

        Assert.False(result.Success);
        Assert.Equal(ResultSource.InvalidInput, result.Source);
    }

    [Fact]
    public async Task Execute_timeout_maps_to_timeout_result()
    {
        var fake = new FakeAdbExecutor();
        fake.Handler = (_, _) => throw new TimeoutException("超时");
        var service = new ExecutionService(fake, new SilentLog());

        var result = await service.ExecuteAsync(Serial, new CommandDefinition { Name = "超时命令", Command = "shell sleep 30" }, null);

        Assert.False(result.Success);
        Assert.Equal(ResultSource.Timeout, result.Source);
    }

    [Fact]
    public async Task Execute_success_regex_wins_over_nonzero_exit()
    {
        var fake = new FakeAdbExecutor();
        fake.Handler = (_, _) => Task.FromResult(Result("write ok", exitCode: 255));
        var service = new ExecutionService(fake, new SilentLog());

        var cmd = new CommandDefinition { Name = "bdft", Command = "shell bdft", SuccessRegex = "write ok" };
        var result = await service.ExecuteAsync(Serial, cmd, null);

        Assert.True(result.Success);
        Assert.Equal(ResultSource.SuccessRegex, result.Source);
    }

    [Fact]
    public async Task Execute_group_does_not_mutate_source_library()
    {
        var fake = new FakeAdbExecutor();
        fake.Handler = (_, _) => Task.FromResult(Result("ok", exitCode: 0));
        var service = new ExecutionService(fake, new SilentLog());

        var group = new CommandGroup
        {
            Name = "组",
            Steps =
            [
                new CommandDefinition { Name = "步骤1", Command = "shell echo {0}", InputPrompts = ["SN"] }
            ]
        };

        var result = await service.ExecuteGroupAsync(Serial, group, ["ABC"]);

        Assert.True(result.AllPassed);
        // 库源数据不被占位符替换污染
        Assert.Equal("shell echo {0}", group.Steps[0].Command);
        Assert.Single(group.Steps[0].InputPrompts);
    }

    [Fact]
    public async Task Execute_group_aborts_on_stop_on_fail_step()
    {
        var fake = new FakeAdbExecutor();
        fake.Handler = (_, _) => Task.FromResult(Result("fail", exitCode: 1));
        var service = new ExecutionService(fake, new SilentLog());

        var group = new CommandGroup
        {
            Name = "组",
            Steps =
            [
                new CommandDefinition { Name = "失败步骤", Command = "shell false", StopOnFail = true },
                new CommandDefinition { Name = "不应执行", Command = "shell true", StopOnFail = true }
            ]
        };

        var result = await service.ExecuteGroupAsync(Serial, group, null);

        Assert.True(result.Aborted);
        Assert.Equal(1, result.AbortedStepIndex);
        Assert.Single(result.Results); // 第二步未执行
    }

    // ==================== 测试支撑 ====================

    private static AdbTextResult Result(string output, int exitCode)
        => new(output, string.Empty, exitCode, ElapsedMs: 10);

    private sealed class FakeAdbExecutor : IAdbCommandExecutor
    {
        public Func<DeviceSerial?, string, Task<AdbTextResult>>? Handler;

        public Task<AdbTextResult> ExecuteAsync(DeviceSerial? serial, string adbArgs,
            TimeSpan? timeout = null, CancellationToken ct = default)
            => Handler?.Invoke(serial, adbArgs)
               ?? Task.FromResult(new AdbTextResult(string.Empty, string.Empty, 0, 0));
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
