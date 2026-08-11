using Yovo.Modules.LogAnalyzer.Application;
using Xunit;

namespace Yovo.Modules.LogAnalyzer.Tests;

/// <summary>过滤管道：级别含以上 / Tag / 关键字 / PID（无正则引擎）</summary>
public class LogFilterTests
{
    private static LogcatLine Line(string level, string tag, string message, string? pid = "1234")
        => new(DateTimeOffset.Now, pid, pid, level, tag, message, $"{level} {tag}: {message}");

    [Fact]
    public void MeetsMinLevel_is_inclusive_above()
    {
        // 选中 W → W/E/F 通过；V/D/I 被滤
        Assert.True(LogFilter.MeetsMinLevel("W", "W"));
        Assert.True(LogFilter.MeetsMinLevel("E", "W"));
        Assert.True(LogFilter.MeetsMinLevel("F", "W"));
        Assert.False(LogFilter.MeetsMinLevel("I", "W"));
        Assert.False(LogFilter.MeetsMinLevel("D", "W"));
        Assert.False(LogFilter.MeetsMinLevel("V", "W"));
    }

    [Fact]
    public void MinLevel_filters_combined_with_other_conditions()
    {
        var options = new LogFilterOptions(MinLevel: "W", Tag: null, Keyword: null, Pid: null);

        Assert.True(LogFilter.Matches(Line("E", "T", "boom"), options));
        Assert.False(LogFilter.Matches(Line("I", "T", "info"), options));
    }

    [Fact]
    public void Tag_filter_is_case_insensitive_contains()
    {
        var options = new LogFilterOptions(null, Tag: "activity", null, null);

        Assert.True(LogFilter.Matches(Line("I", "ActivityManager", "x"), options));
        Assert.False(LogFilter.Matches(Line("I", "SystemServer", "x"), options));
    }

    [Fact]
    public void Keyword_filter_is_contains_not_regex()
    {
        // 无正则：点号是字面字符
        var options = new LogFilterOptions(null, null, Keyword: "Error", null);

        Assert.True(LogFilter.Matches(Line("I", "T", "Some Error here"), options));
        Assert.True(LogFilter.Matches(Line("I", "T", "error"), options)); // 大小写不敏感
        Assert.False(LogFilter.Matches(Line("I", "T", "XErrXor"), options));
        // 字面点号：正则 . 会匹配任意字符，这里不能
        Assert.False(LogFilter.Matches(Line("I", "T", "ErrXor"), new LogFilterOptions(null, null, "Err.or", null)));
    }

    [Fact]
    public void Pid_filter_matches_pid_column()
    {
        var options = new LogFilterOptions(null, null, null, Pid: "123");

        Assert.True(LogFilter.Matches(Line("I", "T", "x", pid: "1234"), options));
        Assert.False(LogFilter.Matches(Line("I", "T", "x", pid: "5678"), options));
    }

    [Fact]
    public void All_options_pass_everything()
    {
        Assert.True(LogFilter.Matches(Line("V", "T", "anything"), LogFilter.All));
    }

    [Fact]
    public void KeywordHit_detects_only_matches()
    {
        var line = Line("E", "T", "boom happened");
        Assert.True(LogFilter.KeywordHit(line, "boom"));
        Assert.False(LogFilter.KeywordHit(line, "missing"));
        Assert.False(LogFilter.KeywordHit(line, "  ")); // 空关键字不命中
    }
}
