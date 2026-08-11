using System.IO;
using Yovo.Platform.Abstractions;
using Yovo.Platform.Abstractions.Settings;

namespace Yovo.Platform;

/// <summary>
/// 应用路径实现 — 全 APP 文件位置的唯一来源（ADR-010）。
/// SettingsRoot 固定于 %LOCALAPPDATA%\YovoAdbTools\settings，永不跟随 DataRoot；
/// DataRoot 默认 %LOCALAPPDATA%\YovoAdbTools\data，可设置覆盖（重启生效）。
/// 注意：AppPaths 依赖 ISettingsStore（读 data.root），SettingsStore 不依赖 AppPaths（设置根固定自足）——无循环。
/// </summary>
public class AppPaths(ISettingsStore settings) : IAppPaths
{
    public const string DataRootKey = "data.root";

    /// <summary>平台设置根（固定，不随数据目录移动）</summary>
    public string SettingsRoot => DefaultPaths.SettingsRoot;

    /// <summary>数据根（设置可覆盖；路径惰性读取，设置后立即反映）</summary>
    public string DataRoot => settings.Get(SettingsScope.App, DataRootKey, DefaultPaths.DefaultDataRoot)
                              ?? DefaultPaths.DefaultDataRoot;

    public string ToolsRoot => Path.Combine(DataRoot, "tools");
    public string CacheRoot => Path.Combine(DataRoot, "cache");
    public string TempRoot => Path.Combine(DataRoot, "temp");

    public string ModuleData(string moduleId) => Path.Combine(DataRoot, "modules", moduleId);
    public string ModuleConfig(string moduleId) => Path.Combine(ModuleData(moduleId), "config");
}
