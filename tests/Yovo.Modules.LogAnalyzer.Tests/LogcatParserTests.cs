using Yovo.Modules.LogAnalyzer.Application;
using Xunit;

namespace Yovo.Modules.LogAnalyzer.Tests;

/// <summary>logcat -v threadtime 行解析（纯函数单元测试）</summary>
public class LogcatParserTests
{
    [Fact]
    public void Parse_threadtime_line_extracts_all_fields()
    {
        var line = "08-11 10:23:45.678  1234  5678 I ActivityManager: Start proc 999";

        var parsed = LogcatParser.Parse(line);

        Assert.NotNull(parsed);
        Assert.Equal("1234", parsed!.Pid);
        Assert.Equal("5678", parsed.Tid);
        Assert.Equal("I", parsed.Level);
        Assert.Equal("ActivityManager", parsed.Tag);
        Assert.Equal("Start proc 999", parsed.Message);
        Assert.Equal(line, parsed.Raw);
        Assert.NotNull(parsed.Timestamp);
    }

    [Fact]
    public void Parse_error_level_with_empty_message()
    {
        var parsed = LogcatParser.Parse("08-11 10:23:45.678  100  200 E AndroidRuntime: ");

        Assert.NotNull(parsed);
        Assert.Equal("E", parsed!.Level);
        Assert.Equal("AndroidRuntime", parsed.Tag);
        Assert.Equal("", parsed.Message);
    }

    [Fact]
    public void Parse_returns_null_for_garbage_line()
    {
        Assert.Null(LogcatParser.Parse("---------- beginning of main ----------"));
        Assert.Null(LogcatParser.Parse(""));
        Assert.Null(LogcatParser.Parse("not a logcat line at all"));
    }

    [Fact]
    public void Parse_handles_tag_without_colon_space()
    {
        var parsed = LogcatParser.Parse("08-11 10:23:45.678  100  200 V Tag:message-no-space");

        Assert.NotNull(parsed);
        Assert.Equal("Tag", parsed!.Tag);
        Assert.Equal("message-no-space", parsed.Message);
    }

    [Fact]
    public void Parse_invalid_date_returns_null_timestamp()
    {
        // 13 月非法
        var parsed = LogcatParser.Parse("13-11 10:23:45.678  100  200 I Tag: msg");

        Assert.NotNull(parsed);
        Assert.Null(parsed!.Timestamp);
    }
}
