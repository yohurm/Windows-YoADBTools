using System.Text.Json.Serialization;
using CommunityToolkit.Mvvm.ComponentModel;

namespace FactoryHelper.Modules.AdbTerminal.Models;

/// <summary>统一参数输入项 — 单条命令与命令组共用的输入框模型</summary>
public partial class InputField : ObservableObject
{
    /// <summary>所属分组标题（命令组时显示如 "步骤3: 写入SN"，单条命令为空）</summary>
    public string? GroupLabel { get; set; }

    /// <summary>输入框标签（提示）</summary>
    public string Label { get; set; } = string.Empty;

    /// <summary>用户输入的值（TwoWay 绑定）</summary>
    [ObservableProperty]
    private string _value = string.Empty;

    /// <summary>是否显示分组标题</summary>
    [JsonIgnore]
    public bool HasGroupLabel => !string.IsNullOrEmpty(GroupLabel);
}
