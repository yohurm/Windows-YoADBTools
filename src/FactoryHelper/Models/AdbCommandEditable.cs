using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace FactoryHelper.Models;

/// <summary>
/// 命令编辑模型 — 用于命令管理界面，包装 AdbCommand 支持界面编辑
/// </summary>
public class AdbCommandEditable : INotifyPropertyChanged
{
    private string _name = string.Empty;
    private string? _category;
    private string _command = string.Empty;
    private int _timeoutMs = 30000;
    private string _inputPromptsText = string.Empty;
    private string? _successRegex;
    private string? _description;

    /// <summary>原始命令（保存时写回）</summary>
    public AdbCommand Source { get; set; } = new();

    public string Name
    {
        get => _name;
        set { _name = value; OnPropertyChanged(); }
    }

    public string? Category
    {
        get => _category;
        set { _category = value; OnPropertyChanged(); }
    }

    public string Command
    {
        get => _command;
        set { _command = value; OnPropertyChanged(); }
    }

    public int TimeoutMs
    {
        get => _timeoutMs;
        set { _timeoutMs = value; OnPropertyChanged(); }
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

    public string? Description
    {
        get => _description;
        set { _description = value; OnPropertyChanged(); }
    }

    /// <summary>
    /// 从 AdbCommand 加载
    /// </summary>
    public static AdbCommandEditable From(AdbCommand cmd)
    {
        return new AdbCommandEditable
        {
            Source = cmd,
            Name = cmd.Name,
            Category = cmd.Category,
            Command = cmd.Command,
            TimeoutMs = cmd.TimeoutMs,
            InputPromptsText = string.Join(", ", cmd.InputPrompts),
            SuccessRegex = cmd.SuccessRegex,
            Description = cmd.Description
        };
    }

    /// <summary>
    /// 写回 AdbCommand（解析输入提示）
    /// </summary>
    public void ApplyToSource()
    {
        Source.Name = Name;
        Source.Category = Category;
        Source.Command = Command;
        Source.TimeoutMs = TimeoutMs;
        Source.SuccessRegex = string.IsNullOrWhiteSpace(SuccessRegex) ? null : SuccessRegex;
        Source.Description = Description;

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