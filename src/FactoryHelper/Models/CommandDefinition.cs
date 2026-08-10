namespace FactoryHelper.Models;

/// <summary>
/// 统一命令模型 — 单条命令与命令组步骤共用。
/// 组步骤特有字段（DelayAfterMs/StopOnFail）在单条命令场景下忽略。
/// </summary>
public class CommandDefinition
{
    /// <summary>命令唯一标识</summary>
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    /// <summary>显示名称（单条命令显示；组步骤显示为步骤名）</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>分组标签（如"通用"、"Nori产测"），单条命令使用</summary>
    public string? Category { get; set; }

    /// <summary>描述</summary>
    public string? Description { get; set; }

    /// <summary>命令模板，支持 {0} {1} 占位符（如 "shell bdft write -sn {0}"）</summary>
    public string Command { get; set; } = string.Empty;

    /// <summary>输入参数提示列表（按顺序对应 {0} {1}...），为空表示无需输入</summary>
    public List<string> InputPrompts { get; set; } = [];

    /// <summary>超时时间（毫秒），默认 30 秒</summary>
    public int TimeoutMs { get; set; } = 30000;

    /// <summary>成功匹配正则 — 输出匹配即视为成功（bdft 等固定返回 255 的工具）</summary>
    public string? SuccessRegex { get; set; }

    /// <summary>失败匹配正则 — 输出匹配即视为失败，优先级最高（参数错误返回 0 的工具）</summary>
    public string? FailureRegex { get; set; }

    /// <summary>执行后等待时间（毫秒），组步骤使用，默认 500</summary>
    public int DelayAfterMs { get; set; } = 500;

    /// <summary>失败是否中断整个命令组，组步骤使用，默认中断</summary>
    public bool StopOnFail { get; set; } = true;

    /// <summary>是否需要输入参数</summary>
    [System.Text.Json.Serialization.JsonIgnore]
    public bool RequiresInput => InputPrompts.Count > 0;

    /// <summary>完整显示命令（带 adb 前缀）— 全站统一显示格式</summary>
    [System.Text.Json.Serialization.JsonIgnore]
    public string DisplayCommand => $"adb {Command}";

    /// <summary>输入提示（逗号分隔文本，管理界面编辑用）</summary>
    [System.Text.Json.Serialization.JsonIgnore]
    public string InputPromptsText
    {
        get => string.Join(", ", InputPrompts);
        set => InputPrompts = value
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(p => p.Length > 0)
            .ToList();
    }
}