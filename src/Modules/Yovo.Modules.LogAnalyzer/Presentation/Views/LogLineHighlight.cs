using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Media;
using Yovo.Modules.LogAnalyzer.Application;

namespace Yovo.Modules.LogAnalyzer.Presentation.Views;

/// <summary>
/// 日志行渲染附加属性（F24/F26/F08 统一入口）— 在 TextBlock 上重建 Inlines：
///   结构化段（时间/PID/级别/Tag）按级别着色；消息段按关键字行内高亮（命中 Accent+Bold）；
///   信号行（FATAL EXCEPTION/AndroidRuntime/ANR）整行浅红背景 + 级别加粗。
/// 颜色从全局 Token 解析（TryFindResource 沿视觉树），模块不硬编码 UI 色。
/// </summary>
public static class LogLineHighlight
{
    public static readonly DependencyProperty LineProperty =
        DependencyProperty.RegisterAttached(
            "Line", typeof(DisplayLine), typeof(LogLineHighlight),
            new PropertyMetadata(null, OnChanged));

    public static readonly DependencyProperty KeywordProperty =
        DependencyProperty.RegisterAttached(
            "Keyword", typeof(string), typeof(LogLineHighlight),
            new PropertyMetadata(null, OnChanged));

    public static DisplayLine? GetLine(DependencyObject obj) => (DisplayLine?)obj.GetValue(LineProperty);
    public static void SetLine(DependencyObject obj, DisplayLine? value) => obj.SetValue(LineProperty, value);

    public static string? GetKeyword(DependencyObject obj) => (string?)obj.GetValue(KeywordProperty);
    public static void SetKeyword(DependencyObject obj, string? value) => obj.SetValue(KeywordProperty, value);

    private static void OnChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is TextBlock textBlock)
            Rebuild(textBlock);
    }

    private static void Rebuild(TextBlock textBlock)
    {
        if (GetLine(textBlock) is not { } display)
            return;

        var line = display.Primary;
        textBlock.Inlines.Clear();
        var isSignal = LogSignalScanner.IsSignal(line);
        var keyword = GetKeyword(textBlock)?.Trim();

        // 信号行整行浅红背景（F26 强调）
        textBlock.Background = isSignal
            ? ResolveBrush(textBlock, "Brush.SignalBg")
            : Brushes.Transparent;

        Add(textBlock, $"{line.Timestamp:MM-dd HH:mm:ss.fff} ", ResolveBrush(textBlock, "Brush.TextTertiary"));
        Add(textBlock, $"{line.Pid} ", ResolveBrush(textBlock, "Brush.TextTertiary"));
        Add(textBlock, $"{line.Level} ", LevelBrush(textBlock, line.Level),
            isSignal ? FontWeights.Bold : FontWeights.Normal);
        Add(textBlock, $"{line.Tag}: ", ResolveBrush(textBlock, "Brush.TextPrimary"), FontWeights.SemiBold);

        // 消息段：按关键字行内高亮（F24，OrdinalIgnoreCase 包含，非正则）
        AppendMessage(textBlock, line.Message, keyword);

        // F34：折叠摘要（+N 行堆栈）以弱化色追加
        if (display.CollapsedCount > 0)
            Add(textBlock, display.CollapsedSummary, ResolveBrush(textBlock, "Brush.TextTertiary"));
    }

    private static void AppendMessage(TextBlock textBlock, string message, string? keyword)
    {
        if (string.IsNullOrEmpty(keyword) ||
            !message.Contains(keyword, StringComparison.OrdinalIgnoreCase))
        {
            Add(textBlock, message, ResolveBrush(textBlock, "Brush.TextPrimary"));
            return;
        }

        // 分段：命中段高亮（Accent + Bold），非命中段普通
        var index = 0;
        while (index < message.Length)
        {
            var hit = message.IndexOf(keyword, index, StringComparison.OrdinalIgnoreCase);
            if (hit < 0)
            {
                Add(textBlock, message[index..], ResolveBrush(textBlock, "Brush.TextPrimary"));
                break;
            }
            if (hit > index)
                Add(textBlock, message[index..hit], ResolveBrush(textBlock, "Brush.TextPrimary"));
            Add(textBlock, message.Substring(hit, keyword.Length),
                ResolveBrush(textBlock, "Brush.Accent"), FontWeights.Bold);
            index = hit + keyword.Length;
        }
    }

    private static void Add(TextBlock textBlock, string text, Brush? foreground, FontWeight? weight = null)
    {
        if (string.IsNullOrEmpty(text))
            return;
        var run = new Run(text);
        if (foreground is not null)
            run.Foreground = foreground;
        if (weight is not null)
            run.FontWeight = weight.Value;
        textBlock.Inlines.Add(run);
    }

    private static Brush? ResolveBrush(TextBlock textBlock, string key)
        => textBlock.TryFindResource(key) as Brush;

    private static Brush? LevelBrush(TextBlock textBlock, string? level)
        => level switch
        {
            "E" or "F" => ResolveBrush(textBlock, "Brush.Error"),
            "W" => ResolveBrush(textBlock, "Brush.Warn"),
            "D" => ResolveBrush(textBlock, "Brush.TextTertiary"),
            _ => ResolveBrush(textBlock, "Brush.TextPrimary"),
        };
}
