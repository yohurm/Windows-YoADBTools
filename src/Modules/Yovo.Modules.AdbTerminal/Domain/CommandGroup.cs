using System.Collections.ObjectModel;
using System.Text.Json.Serialization;
using CommunityToolkit.Mvvm.ComponentModel;

namespace Yovo.Modules.AdbTerminal.Domain;

/// <summary>
/// 命令组 — 一组有序命令，依次执行。步骤与单条命令共用 CommandDefinition。
/// INPC 全量支持：管理窗口直接绑定编辑（无需 Editable 包装）。
/// </summary>
public partial class CommandGroup : ObservableObject
{
    [ObservableProperty]
    private string _id = Guid.NewGuid().ToString("N");

    /// <summary>命令组名称（如 "写入SN"）</summary>
    [ObservableProperty]
    private string _name = string.Empty;

    /// <summary>分组标签</summary>
    [ObservableProperty]
    private string? _category;

    [ObservableProperty]
    private string? _description;

    /// <summary>命令组中的步骤（统一命令模型）</summary>
    public ObservableCollection<CommandDefinition> Steps { get; set; } = [];

    /// <summary>序列化辅助（System.Text.Json 对 ObservableCollection 按 IList 处理）</summary>
    [JsonIgnore]
    public int StepCount => Steps.Count;

    /// <summary>UIA 可访问名称（P2-3）</summary>
    public override string ToString() => Name;
}
