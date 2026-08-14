using System.IO;

namespace Yovo.Platform;

/// <summary>默认路径常量（平台内部单点 — SettingsStore 与 AppPaths 共享，避免两处硬编码）</summary>
internal static class DefaultPaths
{
    public static string LocalAppData =>
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

    /// <summary>设置根（固定，不随数据目录迁移 — ADR-010）</summary>
    public static string SettingsRoot => Path.Combine(LocalAppData, "YovoAdbTools", "settings");

    /// <summary>默认数据根（未设置时）</summary>
    public static string DefaultDataRoot => Path.Combine(LocalAppData, "YovoAdbTools", "data");
}
