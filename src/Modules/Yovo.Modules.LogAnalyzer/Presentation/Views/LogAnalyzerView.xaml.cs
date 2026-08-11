using System.Windows.Controls;

namespace Yovo.Modules.LogAnalyzer.Presentation.Views;

/// <summary>
/// 日志分析视图 — 纯 View（DataContext = LogAnalyzerViewModel）。
/// code-behind 仅保留自动滚底（F21）：贴底跟随新行；用户上滚解锁；滚回底部重新锁定。
/// </summary>
public partial class LogAnalyzerView : UserControl
{
    private bool _isAutoScroll = true;

    public LogAnalyzerView()
    {
        InitializeComponent();
    }

    private void OnLogScrollChanged(object sender, ScrollChangedEventArgs e)
    {
        var scrollViewer = (ScrollViewer)sender;
        var atBottom = Math.Abs(e.VerticalOffset + e.ViewportHeight - e.ExtentHeight) < 1;

        if (atBottom)
            _isAutoScroll = true;             // 用户滚回底部 → 重新跟随
        else if (e.ExtentHeightChange == 0)
            _isAutoScroll = false;            // 高度未变但位置变了 = 用户滚动 → 解锁

        if (e.ExtentHeightChange > 0 && _isAutoScroll)
            scrollViewer.ScrollToEnd();       // 新内容 + 跟随模式 → 滚到底
    }
}
