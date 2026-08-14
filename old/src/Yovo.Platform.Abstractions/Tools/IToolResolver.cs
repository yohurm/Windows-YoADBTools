namespace Yovo.Platform.Abstractions.Tools;

/// <summary>工具标识（枚举可扩展；本期只实现 Adb，投屏 Scrcpy 远期）</summary>
public enum ToolId
{
    Adb,
    // Scrcpy — 远期（ADR-007：本期不实现、不预埋设置项）
}

/// <summary>工具路径解析结果</summary>
public sealed record ToolPath(string ExePath, string HomeDirectory, bool IsAvailable);

/// <summary>
/// 工具解析器 — adb 等工具路径的统一来源。
/// 解析顺序（可配置）：1 用户设置覆盖 → 2 应用旁 tools/（开发）→ 3 嵌入资源解压 → 4 系统 PATH（默认关闭）。
/// </summary>
public interface IToolResolver
{
    /// <summary>解析工具路径（IsAvailable=false 表示不可用，调用方兜底）</summary>
    ToolPath Resolve(ToolId tool);

    /// <summary>确保嵌入工具已解压（幂等）</summary>
    Task EnsureExtractedAsync(ToolId tool, CancellationToken ct = default);

    /// <summary>设置变更后重解析（adb 路径立即生效）</summary>
    void Refresh();
}
