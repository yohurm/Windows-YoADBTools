namespace FactoryHelper.Models;

/// <summary>
/// 命令组中的一个步骤
/// </summary>
public class GroupStep
{
    /// <summary>ADB 命令，支持 {0} {1} 占位符</summary>
    public string Command { get; set; } = string.Empty;

    /// <summary>步骤描述</summary>
    public string? Description { get; set; }

    /// <summary>执行后等待时间（毫秒），默认 500</summary>
    public int DelayAfterMs { get; set; } = 500;

    /// <summary>超时时间（毫秒），默认 30 秒</summary>
    public int TimeoutMs { get; set; } = 30000;

    /// <summary>失败是否中断整个命令组，默认中断</summary>
    public bool StopOnFail { get; set; } = true;

    /// <summary>输入参数提示列表（按顺序对应 {0} {1}...），为空表示无需输入</summary>
    public List<string> InputPrompts { get; set; } = [];

    /// <summary>
    /// 成功匹配正则 — 输出匹配该正则时即使退出码非 0 也视为成功
    /// </summary>
    public string? SuccessRegex { get; set; }

    /// <summary>是否需要输入参数</summary>
    [System.Text.Json.Serialization.JsonIgnore]
    public bool RequiresInput => InputPrompts.Count > 0;
}