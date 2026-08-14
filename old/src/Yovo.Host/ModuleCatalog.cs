using Yovo.Modules.AdbTerminal;
using Yovo.Modules.FileManager;
using Yovo.Modules.LogAnalyzer;
using Yovo.Platform.Abstractions.Composition;
using Yovo.Shell;

namespace Yovo.Host;

/// <summary>
/// 模块目录 — 静态清单（ADR-008：不做运行时热加载）。
/// 真实模块 + Planned 占位（IsPlanned=true，仅贡献导航与"开发中"页）。
/// 投屏显示（screen-mirror）本期仅占位（ADR-007），不做实现。
/// </summary>
public static class ModuleCatalog
{
    public static IReadOnlyList<IModule> CreateAll() =>
    [
        new AdbTerminalModule(),
        new FileManagerModule(),
        new LogAnalyzerModule(),
        new PlannedModule("screen-mirror", "投屏显示", "", sortOrder: 50),
    ];
}
