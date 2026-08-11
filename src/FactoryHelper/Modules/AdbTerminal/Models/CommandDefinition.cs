using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using CommunityToolkit.Mvvm.ComponentModel;

namespace FactoryHelper.Modules.AdbTerminal.Models;

/// <summary>
/// 统一命令模型 — 单条命令与命令组步骤共用。
/// 组步骤特有字段（DelayAfterMs/StopOnFail）在单条命令场景忽略。
/// INPC 全量支持：编辑路径"改名/改分类即时刷新"。
/// </summary>
public partial class CommandDefinition : ObservableObject
{
    [ObservableProperty]
    private string _id = Guid.NewGuid().ToString("N");

    /// <summary>显示名称（单条命令显示；组步骤显示为步骤名）</summary>
    [ObservableProperty]
    private string _name = string.Empty;

    /// <summary>分组标签（命令/命令组共用的唯一分类来源）</summary>
    [ObservableProperty]
    private string? _category;

    [ObservableProperty]
    private string? _description;

    /// <summary>命令模板，支持 {0} {1} 占位符（如 "shell bdft write -sn {0}"）</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(PlaceholderCount))]
    private string _command = string.Empty;

    /// <summary>输入参数提示列表（按顺序对应 {0} {1}...），为空表示无需输入</summary>
    [ObservableProperty]
    private List<string> _inputPrompts = [];

    /// <summary>超时时间（毫秒）</summary>
    [ObservableProperty]
    private int _timeoutMs = 30000;

    /// <summary>成功匹配正则 — 输出匹配即成功（bdft 等固定返回 255 的工具）</summary>
    [ObservableProperty]
    private string? _successRegex;

    /// <summary>失败匹配正则 — 输出匹配即失败，优先级最高（参数错误返回 0 的工具）</summary>
    [ObservableProperty]
    private string? _failureRegex;

    /// <summary>执行后等待时间（毫秒），组步骤使用</summary>
    [ObservableProperty]
    private int _delayAfterMs = 500;

    /// <summary>失败是否中断整个命令组，组步骤使用</summary>
    [ObservableProperty]
    private bool _stopOnFail = true;

    /// <summary>是否需要输入参数</summary>
    [JsonIgnore]
    public bool RequiresInput => InputPrompts.Count > 0;

    /// <summary>完整显示命令（带 adb 前缀）— 全站统一显示格式</summary>
    [JsonIgnore]
    public string DisplayCommand => $"adb {Command}";

    /// <summary>占位符个数（Max{n}+1，无占位符为 0）— 保存时与 InputPrompts 数量一致性校验</summary>
    [JsonIgnore]
    public int PlaceholderCount
    {
        get
        {
            var max = -1;
            foreach (Match m in Regex.Matches(Command, @"\{(\d+)\}"))
            {
                if (int.TryParse(m.Groups[1].Value, out var index) && index > max)
                    max = index;
            }
            return max + 1;
        }
    }

    /// <summary>输入提示（逗号分隔文本，管理界面编辑用）</summary>
    [JsonIgnore]
    public string InputPromptsText
    {
        get => string.Join(", ", InputPrompts);
        set
        {
            InputPrompts = value
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Where(p => p.Length > 0)
                .ToList();
            OnPropertyChanged();
            OnPropertyChanged(nameof(RequiresInput));
        }
    }
}
