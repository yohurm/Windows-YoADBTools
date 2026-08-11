using CommunityToolkit.Mvvm.ComponentModel;
using Yovo.Platform.Abstractions;
using Yovo.Platform.Abstractions.Tasks;

namespace Yovo.Shell.ViewModels;

/// <summary>
/// 状态栏 ViewModel — 版本号 + 后台任务摘要（设备状态文本直接绑定 DeviceRail.StatusText）。
/// 订阅 IBackgroundTaskCenter.Changed，编组回 UI 线程更新摘要。
/// </summary>
public partial class StatusBarViewModel : ObservableObject
{
    private readonly IBackgroundTaskCenter _tasks;
    private readonly IUiDispatcher _ui;

    public string VersionText { get; }

    [ObservableProperty]
    private string _backgroundSummary = string.Empty;

    public StatusBarViewModel(IBackgroundTaskCenter tasks, IUiDispatcher ui, string applicationName, Version applicationVersion)
    {
        _tasks = tasks;
        _ui = ui;
        VersionText = $"{applicationName} v{applicationVersion.Major}.{applicationVersion.Minor}.{applicationVersion.Build}";

        _tasks.Changed += () => _ui.Post(RefreshSummary);
        RefreshSummary();
    }

    private void RefreshSummary()
    {
        var active = _tasks.Active;
        BackgroundSummary = active.Count == 0
            ? string.Empty
            : $"后台任务 {active.Count}";
    }
}
