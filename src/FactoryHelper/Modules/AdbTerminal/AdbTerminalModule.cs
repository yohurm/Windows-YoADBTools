using System.Windows.Controls;
using FactoryHelper.Core;
using FactoryHelper.Modules.AdbTerminal.Services;
using FactoryHelper.Modules.AdbTerminal.ViewModels;
using FactoryHelper.Modules.AdbTerminal.Views;

namespace FactoryHelper.Modules.AdbTerminal;

/// <summary>
/// ADB 命令终端模块 — 模块自治单元。
/// Initialize 内组装模块服务与 ViewModel（模块自持，不进平台 DI）；
/// 模块 Id 常量单点定义（日志 Source / 设置命名空间同源）。
/// </summary>
public class AdbTerminalModule : IModule
{
    /// <summary>模块唯一标识（单点常量）</summary>
    public const string ModuleId = "adb-terminal";

    private TerminalViewModel? _viewModel;
    private TerminalView? _view;

    public string Id => ModuleId;
    public string Title => "ADB 命令终端";
    public string IconGlyph => ""; // Segoe MDL2: 开发者图标
    public int SortOrder => 0;

    public void Initialize(IModuleContext context)
    {
        var repository = new CommandRepository();
        var execution = new ExecutionService(context.Adb, context.Log, ModuleId);
        var reports = new ReportWriter(context.Log, ModuleId);

        _viewModel = new TerminalViewModel(
            repository, execution, reports,
            context.Devices, context.Log, ModuleId,
            new WindowService());
    }

    public UserControl CreateView()
        => _view ??= new TerminalView(_viewModel!); // 单实例复用：设备/命令状态不丢失
}
