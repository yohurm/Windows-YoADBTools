using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace FactoryHelper.Shell;

/// <summary>
/// 预留模块声明 — Shell 导航层展示"开发中"入口。
/// 不注册进 ModuleRegistry（不占用模块 Id，未来真实模块注册时无冲突，
/// 同 Id 的真实模块注册后导航自动被真实项替换）。
/// </summary>
public sealed record PlannedModule(string Id, string Title, string IconGlyph);

/// <summary>"开发中"占位视图（Shell 层，纯展示）</summary>
public sealed class PlannedModuleView : UserControl
{
    public PlannedModuleView(PlannedModule module)
    {
        var panel = new StackPanel
        {
            VerticalAlignment = VerticalAlignment.Center,
            HorizontalAlignment = HorizontalAlignment.Center
        };

        panel.Children.Add(new TextBlock
        {
            Text = "🔧",
            FontSize = 40,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, 12)
        });
        panel.Children.Add(new TextBlock
        {
            Text = module.Title,
            FontSize = 20,
            FontWeight = FontWeights.SemiBold,
            Foreground = new SolidColorBrush(Color.FromRgb(0x5A, 0x5A, 0x5A)),
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, 6)
        });
        panel.Children.Add(new TextBlock
        {
            Text = "该功能模块开发中，敬请期待",
            FontSize = 13,
            Foreground = new SolidColorBrush(Color.FromRgb(0x8A, 0x8A, 0x8A)),
            HorizontalAlignment = HorizontalAlignment.Center
        });

        Content = panel;
    }
}
