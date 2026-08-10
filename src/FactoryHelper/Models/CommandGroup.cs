namespace FactoryHelper.Models;

/// <summary>
/// 命令组 — 一组有序命令，依次执行。步骤与单条命令共用 CommandDefinition。
/// </summary>
public class CommandGroup
{
    /// <summary>命令组唯一标识</summary>
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    /// <summary>命令组名称（如"写入SN"）</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>命令组分组标签（如"通用"、"Nori产测"）</summary>
    public string? Category { get; set; }

    /// <summary>描述</summary>
    public string? Description { get; set; }

    /// <summary>命令组中的步骤（统一命令模型）</summary>
    public List<CommandDefinition> Steps { get; set; } = [];
}