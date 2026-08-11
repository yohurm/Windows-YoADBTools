namespace Yovo.Platform.Abstractions;

/// <summary>
/// 应用路径服务 — 全 APP 文件位置的唯一来源（ADR-010）。
/// SettingsRoot 固定不随 DataRoot（避免"设置的设置"循环依赖）；DataRoot 可配置（重启生效）。
/// 模块数据只写 IAppPaths.ModuleData(Id)，禁止读写他模块目录。
/// </summary>
public interface IAppPaths
{
    /// <summary>平台设置根（固定：%LOCALAPPDATA%\YovoAdbTools\settings）</summary>
    string SettingsRoot { get; }

    /// <summary>数据根（默认与 SettingsRoot 同级 data\，可设置覆盖）</summary>
    string DataRoot { get; }

    /// <summary>工具根（DataRoot\tools，解压的 adb 等）</summary>
    string ToolsRoot { get; }

    /// <summary>缓存根（DataRoot\cache）</summary>
    string CacheRoot { get; }

    /// <summary>临时根（DataRoot\temp，启动时清理过期文件）</summary>
    string TempRoot { get; }

    /// <summary>模块数据目录（DataRoot\modules\{moduleId}）</summary>
    string ModuleData(string moduleId);

    /// <summary>模块配置目录（ModuleData\config）</summary>
    string ModuleConfig(string moduleId);
}
