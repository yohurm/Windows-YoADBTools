using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Text.RegularExpressions;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using FactoryHelper.Modules.AdbTerminal.Models;
using FactoryHelper.Modules.AdbTerminal.Services;

namespace FactoryHelper.Modules.AdbTerminal.ViewModels;

/// <summary>
/// 命令库管理 ViewModel — 基于深拷贝快照编辑，保存时全量替换提交。
/// 取消 = 丢弃快照（零污染共享库）；模型自带 INPC，编辑即时刷新。
/// </summary>
public partial class CommandManagerViewModel : ObservableObject
{
    private readonly CommandRepository _repository;
    private readonly IWindowService _windows;

    /// <summary>编辑快照（深拷贝自库，保存时全量提交）</summary>
    public CommandLibrary Editable { get; }

    public ObservableCollection<CommandDefinition> Commands { get; } = [];
    public ObservableCollection<CommandGroup> Groups { get; } = [];

    [ObservableProperty]
    private CommandDefinition? _selectedCommand;

    [ObservableProperty]
    private CommandGroup? _selectedGroup;

    /// <summary>当前选中的步骤（DataGrid SelectedItem 绑定）</summary>
    [ObservableProperty]
    private CommandDefinition? _selectedStep;

    /// <summary>保存反馈（成功/失败原因）</summary>
    [ObservableProperty]
    private string _saveMessage = string.Empty;

    /// <summary>是否有未保存修改（窗口关闭时询问）</summary>
    public bool IsDirty { get; private set; }

    /// <summary>是否可关闭（无未保存修改）</summary>
    public bool CanClose => !IsDirty;

    public CommandManagerViewModel(CommandLibrary editable, CommandRepository repository, IWindowService windows)
    {
        Editable = editable;
        _repository = repository;
        _windows = windows;

        foreach (var cmd in editable.Commands)
        {
            cmd.PropertyChanged += OnEdited;
            Commands.Add(cmd);
        }
        foreach (var group in editable.Groups)
        {
            group.PropertyChanged += OnEdited;
            SubscribeGroup(group);
            Groups.Add(group);
        }
        Commands.CollectionChanged += (_, _) => IsDirty = true;
        Groups.CollectionChanged += (_, _) => IsDirty = true;
    }

    // ==================== 单条命令 ====================

    [RelayCommand]
    private void AddCommand()
    {
        var cmd = new CommandDefinition
        {
            Name = "新命令",
            Category = SelectedCommand?.Category ?? "通用",
            Command = "shell "
        };
        cmd.PropertyChanged += OnEdited;
        Commands.Add(cmd);
        SelectedCommand = cmd;
    }

    [RelayCommand]
    private void DeleteCommand()
    {
        if (SelectedCommand is not { } cmd)
            return;
        Commands.Remove(cmd);
        SelectedCommand = null;
    }

    [RelayCommand]
    private void PickCommandCategory()
    {
        if (SelectedCommand is not { } cmd)
            return;
        var tag = _windows.PickTag(Editable.Categories, cmd.Category);
        if (tag != null)
            cmd.Category = tag;
    }

    // ==================== 命令组 ====================

    [RelayCommand]
    private void AddGroup()
    {
        var group = new CommandGroup
        {
            Name = "新命令组",
            Category = SelectedGroup?.Category ?? "通用",
            Description = string.Empty
        };
        group.PropertyChanged += OnEdited;
        SubscribeGroup(group);
        Groups.Add(group);
        SelectedGroup = group;
    }

    [RelayCommand]
    private void DeleteGroup()
    {
        if (SelectedGroup is not { } group)
            return;
        UnsubscribeGroup(group);
        Groups.Remove(group);
        SelectedGroup = null;
    }

    [RelayCommand]
    private void PickGroupCategory()
    {
        if (SelectedGroup is not { } group)
            return;
        var tag = _windows.PickTag(Editable.Categories, group.Category);
        if (tag != null)
            group.Category = tag;
    }

    [RelayCommand]
    private void AddStep()
    {
        if (SelectedGroup is not { } group)
            return;
        var step = new CommandDefinition
        {
            Name = $"步骤{group.Steps.Count + 1}",
            Command = "shell ",
            DelayAfterMs = 500,
            StopOnFail = true
        };
        step.PropertyChanged += OnEdited;
        group.Steps.Add(step);
    }

    [RelayCommand]
    private void DeleteStep()
    {
        if (SelectedGroup is not { } group || SelectedStep is not { } step)
            return;
        step.PropertyChanged -= OnEdited;
        group.Steps.Remove(step);
        SelectedStep = null;
    }

    [RelayCommand]
    private void MoveStepUp()
    {
        if (SelectedGroup is not { } group || SelectedStep is not { } step)
            return;
        var index = group.Steps.IndexOf(step);
        if (index <= 0)
            return;
        group.Steps.Move(index, index - 1);
        SelectedStep = step;
    }

    [RelayCommand]
    private void MoveStepDown()
    {
        if (SelectedGroup is not { } group || SelectedStep is not { } step)
            return;
        var index = group.Steps.IndexOf(step);
        if (index < 0 || index >= group.Steps.Count - 1)
            return;
        group.Steps.Move(index, index + 1);
        SelectedStep = step;
    }

    // ==================== 保存 ====================

    [RelayCommand]
    private async Task SaveAsync()
    {
        // 集合 → 快照（序列化载体）
        Editable.Commands = [.. Commands];
        Editable.Groups = [.. Groups];

        // 校验（失败中止保存，消息提示）
        foreach (var cmd in Commands)
        {
            var error = Validate(cmd);
            if (error != null)
            {
                SaveMessage = error;
                return;
            }
        }
        foreach (var group in Groups)
        {
            foreach (var step in group.Steps)
            {
                var error = Validate(step);
                if (error != null)
                {
                    SaveMessage = $"命令组 \"{group.Name}\": {error}";
                    return;
                }
            }
        }

        var result = await _repository.SaveAsync(Editable);
        SaveMessage = result.Success
            ? $"已保存 {Commands.Count} 条命令、{Groups.Count} 个命令组"
            : $"保存失败: {result.Error}";
    }

    // ==================== 内部 ====================

    private void OnEdited(object? sender, PropertyChangedEventArgs e) => IsDirty = true;

    private void SubscribeGroup(CommandGroup group)
    {
        group.Steps.CollectionChanged += (_, _) => IsDirty = true;
        foreach (var step in group.Steps)
            step.PropertyChanged += OnEdited;
    }

    private void UnsubscribeGroup(CommandGroup group)
    {
        foreach (var step in group.Steps)
            step.PropertyChanged -= OnEdited;
    }

    /// <summary>领域校验：名称非空、占位符与输入提示一致、正则合法</summary>
    private static string? Validate(CommandDefinition cmd)
    {
        if (string.IsNullOrWhiteSpace(cmd.Name))
            return $"命令 \"{cmd.Command}\" 名称不能为空";
        if (cmd.PlaceholderCount > cmd.InputPrompts.Count)
            return $"命令 \"{cmd.Name}\" 占位符({cmd.PlaceholderCount} 个) 多于输入提示({cmd.InputPrompts.Count} 个)，执行会出错";
        if (cmd.PlaceholderCount == 0 && cmd.InputPrompts.Count > 0)
            return $"命令 \"{cmd.Name}\" 有 {cmd.InputPrompts.Count} 个输入提示但没有占位符 {{0}}，输入将被忽略";
        if (!IsValidRegex(cmd.SuccessRegex))
            return $"命令 \"{cmd.Name}\" 成功正则无效";
        if (!IsValidRegex(cmd.FailureRegex))
            return $"命令 \"{cmd.Name}\" 失败正则无效";
        return null;
    }

    private static bool IsValidRegex(string? pattern)
    {
        if (string.IsNullOrEmpty(pattern))
            return true;
        try
        {
            _ = new Regex(pattern);
            return true;
        }
        catch
        {
            return false;
        }
    }
}
