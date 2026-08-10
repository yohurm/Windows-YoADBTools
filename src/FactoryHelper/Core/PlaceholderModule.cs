using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace FactoryHelper.Core;

/// <summary>
/// 预留模块占位 — 尚未开发的功能模块，导航栏显示但内容区提示"开发中"
/// </summary>
public class PlaceholderModule : IModule
{
    private readonly string _title;

    public string Id { get; }
    public string Title => _title;

    public PlaceholderModule(string id, string title)
    {
        Id = id;
        _title = title;
    }

    public void Initialize(IModuleContext context)
    {
        // 占位模块无需初始化
    }

    public UserControl CreateView()
    {
        return new PlaceholderView(_title);
    }

    /// <summary>"开发中"占位视图</summary>
    private class PlaceholderView : UserControl
    {
        public PlaceholderView(string title)
        {
            var panel = new StackPanel
            {
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center
            };

            var icon = new TextBlock
            {
                Text = "🔧",
                FontSize = 40,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 12)
            };

            var titleText = new TextBlock
            {
                Text = title,
                FontSize = 20,
                FontWeight = FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Color.FromRgb(0x5A, 0x5A, 0x5A)),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 6)
            };

            var hint = new TextBlock
            {
                Text = "该功能模块开发中，敬请期待",
                FontSize = 13,
                Foreground = new SolidColorBrush(Color.FromRgb(0x8A, 0x8A, 0x8A)),
                HorizontalAlignment = HorizontalAlignment.Center
            };

            panel.Children.Add(icon);
            panel.Children.Add(titleText);
            panel.Children.Add(hint);
            Content = panel;
        }
    }
}