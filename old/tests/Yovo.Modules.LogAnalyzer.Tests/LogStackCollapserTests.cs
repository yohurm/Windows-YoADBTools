using Yovo.Modules.LogAnalyzer.Application;
using Xunit;

namespace Yovo.Modules.LogAnalyzer.Tests;

/// <summary>堆栈折叠（F34）：连续栈帧折叠为单行（缓冲仍全量，导出走原始 Raw）</summary>
public class LogStackCollapserTests
{
    private static LogcatLine Line(string message, string level = "E")
        => new(DateTimeOffset.Now, "100", "200", level, "AndroidRuntime", message, message);

    [Fact]
    public void Stack_frames_are_collapsed_into_previous_line()
    {
        var lines = new[]
        {
            Line("FATAL EXCEPTION: main"),
            Line("\tat com.example.Main.onCreate(Main.java:10)"),
            Line("\tat com.example.App.start(App.java:5)"),
            Line("\t... 3 more"),
            Line("after the stack, normal line"),
        };

        var collapsed = LogStackCollapser.Collapse(lines);

        Assert.Equal(2, collapsed.Count);
        Assert.Equal(3, collapsed[0].CollapsedCount);           // 折叠头（FATAL）折叠了 3 个栈帧
        Assert.Equal(3, collapsed[0].Collapsed.Count);
        Assert.Equal(0, collapsed[1].CollapsedCount);           // 后续普通行
        // 折叠摘要文本
        Assert.Equal("\n\t… +3 行堆栈", collapsed[0].CollapsedSummary);
        // 折叠组保留全部栈帧（导出仍可还原完整原文）
        Assert.Contains("\tat com.example.Main.onCreate", collapsed[0].Collapsed[0].Raw);
        Assert.Equal("\t... 3 more", collapsed[0].Collapsed[2].Raw);
    }

    [Fact]
    public void Non_stack_lines_are_not_collapsed()
    {
        var lines = new[]
        {
            Line("normal one", "I"),
            Line("normal two", "I"),
            Line("ActivityManager: Start proc", "I"),
        };

        var collapsed = LogStackCollapser.Collapse(lines);

        Assert.Equal(3, collapsed.Count);
        Assert.All(collapsed, d => Assert.Equal(0, d.CollapsedCount));
    }

    [Fact]
    public void Orphan_stack_line_without_header_is_kept_visible()
    {
        var lines = new[] { Line("\tat com.example.orphan.run()") };

        var collapsed = LogStackCollapser.Collapse(lines);

        Assert.Single(collapsed);
        Assert.Equal(0, collapsed[0].CollapsedCount); // 无前文 → 普通展示
    }

    [Fact]
    public void Multiple_stack_groups_are_collapsed_independently()
    {
        var lines = new[]
        {
            Line("first error"),
            Line("\tat A.a()"),
            Line("second error"),
            Line("\tat B.b()"),
            Line("\tat C.c()"),
        };

        var collapsed = LogStackCollapser.Collapse(lines);

        Assert.Equal(2, collapsed.Count);
        Assert.Equal(1, collapsed[0].CollapsedCount);
        Assert.Equal(2, collapsed[1].CollapsedCount);
    }
}
