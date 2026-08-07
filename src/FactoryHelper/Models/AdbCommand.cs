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

    /// <summary>命令分类（如"系统信息"、"设备控制"）</summary>
    public string? Category { get; set; }

    /// <summary>ADB 命令内容（如 "shell getprop ro.product.model"）</summary>
    public string Command { get; set; } = string.Empty;

    /// <summary>超时时间（毫秒），默认 30 秒</summary>
    public int TimeoutMs { get; set; } = 30000;
}