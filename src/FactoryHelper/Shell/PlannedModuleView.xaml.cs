using System.Windows.Controls;

namespace FactoryHelper.Shell;

/// <summary>
/// "开发中"占位视图（Shell 层，纯展示；标题由构造函数注入）。
/// </summary>
public partial class PlannedModuleView : UserControl
{
    public PlannedModuleView(PlannedModule module)
    {
        InitializeComponent();
        Title = module.Title;
    }

    /// <summary>占位模块标题（绑定到视图内标题文本）</summary>
    public string Title { get; }
}
