namespace FactoryHelper.Models;

/// <summary>
/// 命令组中的一个步骤
/// </summary>
public class GroupStep
{
    /// <summary>ADB 命令</summary>
    public string Command { get; set; } = string.Empty;

    /// <summary>步骤描述</summary>
    public string? Description { get; set; }

    /// <summary>执行后等待时间（毫秒）</summary>
    public int DelayAfterMs { get; set; }

    /// <summary>超时时间（毫秒）</summary>
    public int TimeoutMs { get; set; } = 30000;
}