using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace FactoryHelper.Models;

/// <summary>
/// 命令组编辑包装 — 提供 INotifyPropertyChanged 供管理界面绑定，
/// 步骤直接使用统一命令模型 CommandDefinition
/// </summary>
public class CommandGroupEditable : INotifyPropertyChanged
{
    private string _name = string.Empty;
    private string? _category;
    private string? _description;

    /// <summary>对应命令库中的源对象（同一引用，保存时同步）</summary>
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

    /// <summary>步骤列表（统一命令模型）</summary>
    public ObservableCollection<CommandDefinition> Steps { get; } = [];

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
            editable.Steps.Add(step);
        return editable;
    }

    /// <summary>将编辑值同步回源对象</summary>
    public void ApplyToSource()
    {
        Source.Name = Name;
        Source.Category = Category;
        Source.Description = Description;
        Source.Steps = Steps.ToList();
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? name = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}