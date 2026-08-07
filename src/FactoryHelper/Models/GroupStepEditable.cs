using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace FactoryHelper.Models;

/// <summary>
/// 步骤编辑模型 — 用于命令组管理界面
/// </summary>
public class GroupStepEditable : INotifyPropertyChanged
{
    private string _command = string.Empty;
    private string? _description;
    private int _delayAfterMs = 500;
    private int _timeoutMs = 30000;
    private bool _stopOnFail = true;
    private string _inputPromptsText = string.Empty;
    private string? _successRegex;

    /// <summary>原始步骤（保存时写回）</summary>
    public GroupStep Source { get; set; } = new();

    /// <summary>步骤序号（界面显示用，从 1 开始）</summary>
    public int Index { get; set; }

    public string Command
    {
        get => _command;
        set { _command = value; OnPropertyChanged(); }
    }

    public string? Description
    {
        get => _description;
        set { _description = value; OnPropertyChanged(); }
    }

    public int DelayAfterMs
    {
        get => _delayAfterMs;
        set { _delayAfterMs = value; OnPropertyChanged(); }
    }

    public int TimeoutMs
    {
        get => _timeoutMs;
        set { _timeoutMs = value; OnPropertyChanged(); }
    }

    public bool StopOnFail
    {
        get => _stopOnFail;
        set { _stopOnFail = value; OnPropertyChanged(); }
    }

    /// <summary>输入提示（逗号分隔文本）</summary>
    public string InputPromptsText
    {
        get => _inputPromptsText;
        set { _inputPromptsText = value; OnPropertyChanged(); }
    }

    /// <summary>成功匹配正则（输出匹配即视为成功，适用于 bdft 等固定返回非 0 的工具）</summary>
    public string? SuccessRegex
    {
        get => _successRegex;
        set { _successRegex = value; OnPropertyChanged(); }
    }

    public static GroupStepEditable From(GroupStep step)
    {
        return new GroupStepEditable
        {
            Source = step,
            Command = step.Command,
            Description = step.Description,
            DelayAfterMs = step.DelayAfterMs,
            TimeoutMs = step.TimeoutMs,
            StopOnFail = step.StopOnFail,
            InputPromptsText = string.Join(", ", step.InputPrompts),
            SuccessRegex = step.SuccessRegex
        };
    }

    public void ApplyToSource()
    {
        Source.Command = Command;
        Source.Description = Description;
        Source.DelayAfterMs = DelayAfterMs;
        Source.TimeoutMs = TimeoutMs;
        Source.StopOnFail = StopOnFail;
        Source.SuccessRegex = string.IsNullOrWhiteSpace(SuccessRegex) ? null : SuccessRegex;
        Source.InputPrompts = InputPromptsText
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(p => p.Length > 0)
            .ToList();
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? name = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}