using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace FactoryHelper.Models;

/// <summary>
/// 命令参数输入项 — 对应命令模板中的一个占位符 {0} {1}...
/// </summary>
public class CommandInputItem : INotifyPropertyChanged
{
    private string _value = string.Empty;

    /// <summary>输入框标签（提示）</summary>
    public string Label { get; set; } = string.Empty;

    /// <summary>用户输入的值</summary>
    public string Value
    {
        get => _value;
        set
        {
            _value = value;
            OnPropertyChanged();
        }
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? name = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}