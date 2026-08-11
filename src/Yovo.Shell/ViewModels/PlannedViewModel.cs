using CommunityToolkit.Mvvm.ComponentModel;

namespace Yovo.Shell.ViewModels;

/// <summary>预留模块占位页 ViewModel — 仅展示"开发中"信息</summary>
public partial class PlannedViewModel : ObservableObject
{
    public string Title { get; }

    public PlannedViewModel(string title)
    {
        Title = title;
    }
}
