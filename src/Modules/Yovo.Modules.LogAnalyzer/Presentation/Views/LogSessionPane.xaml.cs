using System.Windows;
using System.Windows.Controls;
using Yovo.Modules.LogAnalyzer.Presentation.ViewModels;

namespace Yovo.Modules.LogAnalyzer.Presentation.Views;

/// <summary>
/// 单会话窗格（M1 F40）— 过滤栏 + 日志列表（DataContext = LogSessionViewModel）。
/// code-behind 仅保留：自动滚底（F21，每会话独立）+ Ctrl+F 检索聚焦入口。
/// </summary>
public partial class LogSessionPane : UserControl
{
    private bool _isAutoScroll = true;

    public LogSessionPane()
    {
        InitializeComponent();
    }

    /// <summary>Ctrl+F 聚焦本会话检索框（主机视图调用）</summary>
    public void FocusKeyword() => KeywordBox.Focus();

    private void OnLogScrollChanged(object sender, ScrollChangedEventArgs e)
    {
        // 附加事件注册在 ListView 上，实际触发者是模板内部 ScrollViewer（OriginalSource）
        if (e.OriginalSource is not ScrollViewer scrollViewer)
            return;
        var atBottom = Math.Abs(e.VerticalOffset + e.ViewportHeight - e.ExtentHeight) < 1;

        if (atBottom)
            _isAutoScroll = true;             // 用户滚回底部 → 重新跟随
        else if (e.ExtentHeightChange == 0)
            _isAutoScroll = false;            // 高度未变但位置变了 = 用户滚动 → 解锁

        if (e.ExtentHeightChange > 0 && _isAutoScroll)
            scrollViewer.ScrollToEnd();       // 新内容 + 跟随模式 → 滚到底
    }
}
