namespace FactoryHelper.Models;

/// <summary>
/// 命令组 — 一组有序命令，依次执行
/// </summary>
public class CommandGroup
{
    /// <summary>命令组唯一标识</summary>
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    /// <summary>命令组名称（如"音频测试"）</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>描述</summary>
    public string? Description { get; set; }

    /// <summary>命令组中的命令列表</summary>
    public List<GroupStep> Steps { get; set; } = new();
}