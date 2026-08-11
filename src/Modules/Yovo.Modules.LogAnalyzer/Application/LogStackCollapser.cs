namespace Yovo.Modules.LogAnalyzer.Application;

/// <summary>显示行（F34 折叠模型）：Primary 为首行，Collapsed 为被折叠的连续栈行</summary>
public sealed record DisplayLine(LogcatLine Primary, IReadOnlyList<LogcatLine> Collapsed)
{
    /// <summary>折叠行数（0 = 普通行）</summary>
    public int CollapsedCount => Collapsed.Count;

    /// <summary>折叠摘要文本（追加在 Primary 消息后显示）</summary>
    public string CollapsedSummary => Collapsed.Count > 0 ? $"\n\t… +{Collapsed.Count} 行堆栈" : string.Empty;

    /// <summary>复制/导出用的完整原文（含折叠行）</summary>
    public string FullRaw => Collapsed.Count == 0
        ? Primary.Raw
        : string.Join('\n', new[] { Primary.Raw }.Concat(Collapsed.Select(l => l.Raw)));
}

/// <summary>
/// 堆栈折叠（F34）— 连续栈帧行（\tat / \t... 开头）折叠到前一条非栈行。
/// 折叠的是显示层（缓冲仍全量）；复制/导出输出完整原文。
/// </summary>
public static class LogStackCollapser
{
    /// <summary>栈帧特征：Java 缩进帧（\tat ...）与省略行（\t... N more）</summary>
    public static bool IsStackLine(LogcatLine line)
        => line.Message.StartsWith("\tat ", StringComparison.Ordinal) ||
           line.Message.StartsWith("\t... ", StringComparison.Ordinal);

    /// <summary>折叠连续栈行为 DisplayLine 序列（追加与重放共用）</summary>
    public static IReadOnlyList<DisplayLine> Collapse(IEnumerable<LogcatLine> lines)
    {
        var result = new List<DisplayLine>();
        DisplayLine? pending = null;
        var pendingStack = new List<LogcatLine>();

        foreach (var line in lines)
        {
            if (IsStackLine(line))
            {
                if (pending is null)
                {
                    // 孤立栈行（无前文）：作为普通行展示（保留信息）
                    result.Add(new DisplayLine(line, []));
                }
                else
                {
                    pendingStack.Add(line);
                }
                continue;
            }

            // 非栈行：收尾前一个折叠组
            if (pending is not null)
            {
                result.Add(new DisplayLine(pending.Primary, pendingStack.ToList()));
                pendingStack.Clear();
            }
            pending = new DisplayLine(line, []);
        }

        if (pending is not null)
            result.Add(new DisplayLine(pending.Primary, pendingStack.ToList()));

        return result;
    }
}
