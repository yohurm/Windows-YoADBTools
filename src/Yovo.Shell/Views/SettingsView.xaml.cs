using System.Windows.Controls;

namespace Yovo.Shell.Views;

/// <summary>设置面板 — 纯 View（DataContext 由 ViewLocator 注入 SettingsViewModel）</summary>
public partial class SettingsView : UserControl
{
    public SettingsView()
    {
        InitializeComponent();
    }
}
