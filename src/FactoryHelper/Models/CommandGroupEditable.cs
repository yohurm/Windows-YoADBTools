using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace FactoryHelper.Models;

/// <summary>
/// 命令组编辑模型 — 用于命令组管理界面
/// </summary>
public class CommandGroupEditable : INotifyPropertyChanged
{
    private string _name = string.Empty;
    private string? _category;
    private string? _description;

    /// <summary>原始命令组（保存时写回）</summary>
    public CommandGroup Source { get; set; } = new();

    public string Name
    {
        get => _name;
        set { _name = value; OnPropertyChanged(); }
    }

    /// <summary>分组标签（如"通用"、"Nori产测"）</summary>
    public string? Category
    {
        get => _category;
        set { _category = value; OnPropertyChanged(); }
    }

    public string? Description
    {
        get => _description;
        set { _description = value; OnPropertyChanged(); }
    }

    /// <summary>步骤列表（可编辑）</summary>
    public ObservableCollection<GroupStepEditable> Steps { get; } = [];

    /// <summary>步骤数量（界面显示用）</summary>
    public string StepCount => $"{Steps.Count} 步";

    public static CommandGroupEditable From(CommandGroup group)
    {
        var editable = new CommandGroupEditable
        {
            Source = group,
            Name = group.Name,
            Category = group.Category,
            Description = group.Description
        };
        foreach (var step in group.Steps)
            editable.Steps.Add(GroupStepEditable.From(step));
        return editable;
    }

    public void ApplyToSource()
    {
        Source.Name = Name;
        Source.Category = Category;
        Source.Description = Description;
        Source.Steps = Steps.Select(s => s.Source).ToList();
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? name = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}