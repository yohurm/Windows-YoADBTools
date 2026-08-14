using Yovo.Modules.LogAnalyzer.Application;
using Xunit;

namespace Yovo.Modules.LogAnalyzer.Tests;

/// <summary>崩溃/异常信号扫描（FATAL EXCEPTION / AndroidRuntime / ANR）</summary>
public class LogSignalScannerTests
{
    private static LogcatLine Line(string message, string level = "E")
        => new(DateTimeOffset.Now, "100", "200", level, "AndroidRuntime", message, message);

    [Theory]
    [InlineData("FATAL EXCEPTION: main")]
    [InlineData("ANR in com.example")]
    public void Signal_markers_are_detected(string message)
    {
        Assert.True(LogSignalScanner.IsSignal(Line(message)));
    }

    [Theory]
    [InlineData("normal message")]
    [InlineData("warning something")]
    [InlineData("")]
    [InlineData("Process: com.example, PID: 123")] // 无 FATAL/ANR 特征的 Process 行不算信号
    [InlineData("Process: com.android.phone")]
    public void Non_signal_lines_are_not_marked(string message)
    {
        Assert.False(LogSignalScanner.IsSignal(Line(message)));
    }

    [Fact]
    public void CountSignals_counts_only_matching()
    {
        var lines = new[]
        {
            Line("FATAL EXCEPTION: main"),
            Line("ANR in com.example"),
            Line("just a log line"),
            Line("another normal line"),
        };

        Assert.Equal(2, LogSignalScanner.CountSignals(lines));
    }

    [Fact]
    public void Signal_detection_is_case_insensitive()
    {
        Assert.True(LogSignalScanner.IsSignal(Line("fatal exception: main")));
        Assert.True(LogSignalScanner.IsSignal(Line("Anr in com.example")));
    }
}
