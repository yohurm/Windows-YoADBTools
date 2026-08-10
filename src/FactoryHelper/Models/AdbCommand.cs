namespace FactoryHelper.Models;

/// <summary>
/// ADB 命令定义
/// </summary>
public class AdbCommand
{
    /// <summary>命令唯一标识</summary>
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    /// <summary>命令显示名称</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>命令描述</summary>
    public string? Description { get; set; }

    /// <summary>命令分类（如"通用"、"Nori产测"）</summary>
    public string? Category { get; set; }

    /// <summary>ADB 命令内容（如 "shell getprop ro.product.model"）</summary>
    /// <remarks>需要输入时使用 {0} {1} 占位符，如 "shell bdft write -pcbasn {0}"</remarks>
    public string Command { get; set; } = string.Empty;

    /// <summary>输入参数提示列表（按顺序对应 {0} {1}...），为空表示无需输入</summary>
    public List<string> InputPrompts { get; set; } = [];

    /// <summary>超时时间（毫秒），默认 30 秒</summary>
    public int TimeoutMs { get; set; } = 30000;

    /// <summary>
    /// 成功匹配正则 — 输出匹配该正则时即使退出码非 0 也视为成功。
    /// 适用于 bdft 等厂商工具（输出正常但固定返回 255）
    /// </summary>
    public string? SuccessRegex { get; set; }

    /// <summary>
    /// 失败匹配正则 — 输出匹配该正则时即使退出码为 0 也视为失败（优先级最高）。
    /// 适用于厂商工具"参数错误时返回 0 但输出错误信息"的异常行为
    /// </summary>
    public string? FailureRegex { get; set; }

    /// <summary>是否需要输入参数</summary>
    [System.Text.Json.Serialization.JsonIgnore]
    public bool RequiresInput => InputPrompts.Count > 0;

    /// <summary>完整显示命令（带 adb 前缀，界面展示用）</summary>
    [System.Text.Json.Serialization.JsonIgnore]
    public string DisplayCommand => $"adb {Command}";
}