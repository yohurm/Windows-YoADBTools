using System.IO;
using Yovo.Platform.Abstractions;
using Yovo.Platform.Abstractions.Settings;

namespace Yovo.Platform;

/// <summary>
/// 应用路径实现 — 全 APP 文件位置的唯一来源（ADR-010）。
/// SettingsRoot 固定于 %LOCALAPPDATA%\YovoAdbTools\settings，永不跟随 DataRoot；
/// DataRoot 默认 %LOCALAPPDATA%\YovoAdbTools\data，可设置覆盖（H4：启动冻结快照，修改后重启生效）。
/// 注意：AppPaths 依赖 ISettingsStore（读 data.root），SettingsStore 不依赖 AppPaths（设置根固定自足）——无循环。
/// </summary>
public class AppPaths : IAppPaths
{
    public const string DataRootKey = "data.root";

    private readonly string _dataRoot;

    public AppPaths(ISettingsStore settings)
    {
        // H4：DataRoot 启动时冻结快照（与 UI 文案「重启生效」一致；运行中修改设置不影响当前实例）
        _dataRoot = settings.Get(SettingsScope.App, DataRootKey, DefaultPaths.DefaultDataRoot)
                    ?? DefaultPaths.DefaultDataRoot;
    }

    /// <summary>平台设置根（固定，不随数据目录移动）</summary>
    public string SettingsRoot => DefaultPaths.SettingsRoot;

    /// <summary>数据根（启动冻结快照 — 修改设置后重启生效）</summary>
    public string DataRoot => _dataRoot;

    public string ToolsRoot => Path.Combine(DataRoot, "tools");
    public string CacheRoot => Path.Combine(DataRoot, "cache");
    public string TempRoot => Path.Combine(DataRoot, "temp");

    public string ModuleData(string moduleId) => Path.Combine(DataRoot, "modules", moduleId);
    public string ModuleConfig(string moduleId) => Path.Combine(ModuleData(moduleId), "config");
}
