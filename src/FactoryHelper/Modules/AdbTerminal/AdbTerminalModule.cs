using System.Windows.Controls;
using FactoryHelper.Core;

namespace FactoryHelper.Modules.AdbTerminal;

/// <summary>
/// ADB 命令终端模块 — Yovo ADB Tools 首个功能模块。
/// 后续新增模块（投屏显示等）参照本模块实现 IModule 并注册。
/// </summary>
public class AdbTerminalModule : IModule
{
    private IModuleContext? _context;
    private Views.TerminalView? _view;

    public string Id => "adb-terminal";
    public string Title => "ADB 命令终端";

    public void Initialize(IModuleContext context)
    {
        _context = context;
    }

    public UserControl CreateView()
    {
        // 视图生命周期由 Shell 持有，单实例复用（设备列表状态不丢失）
        return _view ??= new Views.TerminalView(_context!);
    }
}