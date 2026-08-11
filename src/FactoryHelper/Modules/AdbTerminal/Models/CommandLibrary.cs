using System.Text.Json;
using System.Text.Json.Serialization;

namespace FactoryHelper.Modules.AdbTerminal.Models;

/// <summary>命令库序列化配置（全模块统一）</summary>
internal static class LibraryJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };
}

/// <summary>
/// 命令库 — 单文件序列化根 + 编辑快照载体。
/// 编辑窗口操作 DeepClone 快照，保存时全量替换（取消零污染）。
/// </summary>
public class CommandLibrary
{
    /// <summary>schema 版本（预留迁移钩子；与内置版本不一致时视为不可用配置）</summary>
    public int Version { get; set; } = 1;

    /// <summary>单条命令库</summary>
    public List<CommandDefinition> Commands { get; set; } = [];

    /// <summary>命令组库</summary>
    public List<CommandGroup> Groups { get; set; } = [];

    /// <summary>分组标签（纯派生：命令/命令组 Category 去重）</summary>
    [JsonIgnore]
    public IReadOnlyList<string> Categories =>
        Commands.Select(c => c.Category)
                .Concat(Groups.Select(g => g.Category))
                .Where(c => !string.IsNullOrWhiteSpace(c))
                .Cast<string>()
                .Distinct()
                .ToList();

    /// <summary>深度克隆（序列化 round-trip，含步骤）— 编辑快照用</summary>
    public CommandLibrary DeepClone()
    {
        var json = JsonSerializer.Serialize(this, LibraryJson.Options);
        return JsonSerializer.Deserialize<CommandLibrary>(json, LibraryJson.Options) ?? new CommandLibrary();
    }

    /// <summary>序列化为 JSON 文本</summary>
    public string ToJson() => JsonSerializer.Serialize(this, LibraryJson.Options);

    /// <summary>从 JSON 反序列化（失败返回 null）</summary>
    public static CommandLibrary? FromJson(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<CommandLibrary>(json, LibraryJson.Options);
        }
        catch
        {
            return null;
        }
    }
}
