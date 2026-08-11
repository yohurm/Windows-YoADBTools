using System.IO;

namespace FactoryHelper.Platform;

/// <summary>
/// 应用路径服务 — 全 APP 文件位置的唯一来源。
/// 数据目录（命令库/ADB 解压）可通过设置覆盖；ADB 路径可单独覆盖。
/// 设置项存在 SettingsService（moduleId="app"）：
///   - "adb.path"  用户指定的 adb.exe 路径或目录（空 = 自动解析）
///   - "data.dir"  数据目录（空 = 默认 %LOCALAPPDATA%\YovoAdbTools）
/// 注意：SettingsService 自身文件固定在 %LOCALAPPDATA%\YovoAdbTools\Settings\，
/// 不随数据目录移动（避免"设置的设置"循环依赖）。
/// </summary>
public class AppPaths
{
    public const string SettingsModule = "app";
    public const string AdbPathKey = "adb.path";
    public const string DataDirKey = "data.dir";

    private readonly ISettingsService _settings;

    public AppPaths(ISettingsService settings)
    {
        _settings = settings;
    }

    /// <summary>默认数据目录（未设置时）</summary>
    public static string DefaultDataDir =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "YovoAdbTools");

    /// <summary>当前数据目录（设置可覆盖，重启生效）</summary>
    public string DataDir => _settings.Get(SettingsModule, DataDirKey, DefaultDataDir) ?? DefaultDataDir;

    /// <summary>命令库配置目录</summary>
    public string ConfigDir => Path.Combine(DataDir, "Config");

    /// <summary>ADB 解压目录</summary>
    public string AdbDir => Path.Combine(DataDir, "adb");

    /// <summary>用户指定的 ADB 路径（exe 或目录；空 = 自动解析）</summary>
    public string? AdbPathOverride => _settings.Get<string?>(SettingsModule, AdbPathKey, null);

    /// <summary>设置保存后调用：清缓存（AppPaths 无缓存，保留钩子供后续扩展）</summary>
    public void Invalidate()
    {
        // 路径均为惰性读取，无需缓存清理
    }
}
