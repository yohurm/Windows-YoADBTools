using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using FactoryHelper.Models;
using FactoryHelper.Services;
using MessageBox = System.Windows.MessageBox;
using MessageBoxButton = System.Windows.MessageBoxButton;
using MessageBoxImage = System.Windows.MessageBoxImage;
using MessageBoxResult = System.Windows.MessageBoxResult;
using Wpf.Ui.Controls;

namespace FactoryHelper.Views;

/// <summary>
/// 命令库管理窗口 — 直接操作 CommandLibraryService（单一数据源，实时同步主界面）
/// </summary>
public partial class CommandManagerWindow : FluentWindow
{
    private readonly ICommandLibraryService _library;
    private readonly ObservableCollection<CommandDefinition> _editableCommands = [];
    private readonly ObservableCollection<CommandGroupEditable> _editableGroups = [];

    /// <summary>是否有未保存的修改（界面提示用）</summary>
    private bool _isDirty;

    public CommandManagerWindow(ICommandLibraryService library)
    {
        InitializeComponent();
        _library = library;

        foreach (var cmd in _library.Commands)
            _editableCommands.Add(cmd);
        foreach (var group in _library.Groups)
            _editableGroups.Add(CommandGroupEditable.From(group));

        CmdListBox.ItemsSource = _editableCommands;
        GroupListBox.ItemsSource = _editableGroups;

        DataContext = null; // 初始无选中项
    }

    // ==================== 脏检查 ====================

    private void MarkDirty() => _isDirty = true;

    private void OnEditChanged(object sender, TextChangedEventArgs e) => MarkDirty();

    private void OnStepsGridCellEditEnding(object sender, DataGridCellEditEndingEventArgs e) => MarkDirty();

    private void OnWindowClosing(object? sender, CancelEventArgs e)
    {
        if (_isDirty)
        {
            var result = System.Windows.MessageBox.Show(this,
                "有未保存的修改，确定要关闭吗？\n（未保存的更改将丢失）",
                "未保存修改",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning);
            if (result != MessageBoxResult.Yes)
                e.Cancel = true;
        }
    }

    // ==================== 单条命令 ====================

    private CommandDefinition? SelectedCommand { get; set; }

    private void OnCommandSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        SelectedCommand = CmdListBox.SelectedItem as CommandDefinition;
        DataContext = SelectedCommand;
    }

    private void OnNewCommandClick(object sender, RoutedEventArgs e)
    {
        var item = new CommandDefinition
        {
            Name = "新命令",
            Category = SelectedCommand?.Category ?? "通用",
            Command = "shell "
        };
        _editableCommands.Add(item);
        CmdListBox.SelectedItem = item;
        MarkDirty();
    }

    private void OnDeleteCommandClick(object sender, RoutedEventArgs e)
    {
        if (SelectedCommand == null) return;

        if (System.Windows.MessageBox.Show(this, $"确定删除命令 \"{SelectedCommand.Name}\"？", "删除确认",
                MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes)
            return;

        _editableCommands.Remove(SelectedCommand);
        CmdListBox.SelectedItem = null;
        MarkDirty();
    }

    private void OnPickCommandCategoryClick(object sender, RoutedEventArgs e)
    {
        if (SelectedCommand == null) return;
        var tag = PickTag(SelectedCommand.Category);
        if (tag != null)
            SelectedCommand.Category = tag;
    }

    private async void OnSaveCommandsClick(object sender, RoutedEventArgs e)
    {
        // 同步到命令库（Add 新命令 / Update 已有命令）
        foreach (var cmd in _editableCommands)
        {
            if (_library.Commands.Any(c => c.Id == cmd.Id))
                _library.UpdateCommand(cmd);
            else
                _library.AddCommand(cmd);
        }
        // 删除库中有、列表中已移除的命令
        var keptIds = _editableCommands.Select(c => c.Id).ToHashSet();
        foreach (var id in _library.Commands.Select(c => c.Id).Where(id => !keptIds.Contains(id)).ToList())
            _library.DeleteCommand(id);

        await _library.SaveAsync();
        _isDirty = false;
        System.Windows.MessageBox.Show(this, $"已保存 {_editableCommands.Count} 条命令", "保存成功",
            MessageBoxButton.OK, MessageBoxImage.Information);
    }

    // ==================== 命令组 ====================

    private CommandGroupEditable? SelectedGroup { get; set; }

    private void OnGroupSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        SelectedGroup = GroupListBox.SelectedItem as CommandGroupEditable;
        RefreshGroupEditor();
    }

    private void RefreshGroupEditor()
    {
        if (SelectedGroup == null)
        {
            GroupNameBox.Text = string.Empty;
            GroupCategoryBox.Text = string.Empty;
            GroupDescBox.Text = string.Empty;
            StepsGrid.ItemsSource = null;
            return;
        }

        GroupNameBox.Text = SelectedGroup.Name;
        GroupCategoryBox.Text = SelectedGroup.Category ?? string.Empty;
        GroupDescBox.Text = SelectedGroup.Description ?? string.Empty;

        StepsGrid.ItemsSource = SelectedGroup.Steps;
    }

    private void OnNewGroupClick(object sender, RoutedEventArgs e)
    {
        var item = CommandGroupEditable.From(new CommandGroup
        {
            Name = "新命令组",
            Category = SelectedGroup?.Category ?? "通用",
            Description = ""
        });
        _editableGroups.Add(item);
        GroupListBox.SelectedItem = item;
        MarkDirty();
    }

    private void OnDeleteGroupClick(object sender, RoutedEventArgs e)
    {
        if (SelectedGroup == null) return;

        if (System.Windows.MessageBox.Show(this, $"确定删除命令组 \"{SelectedGroup.Name}\"？", "删除确认",
                MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes)
            return;

        _editableGroups.Remove(SelectedGroup);
        GroupListBox.SelectedItem = null;
        MarkDirty();
    }

    private void OnPickGroupCategoryClick(object sender, RoutedEventArgs e)
    {
        if (SelectedGroup == null) return;
        var tag = PickTag(SelectedGroup.Category);
        if (tag != null)
        {
            SelectedGroup.Category = tag;
            RefreshGroupEditor();
        }
    }

    private void OnAddStepClick(object sender, RoutedEventArgs e)
    {
        if (SelectedGroup == null) return;

        SelectedGroup.Steps.Add(new CommandDefinition
        {
            Name = "新步骤",
            Command = "shell ",
            DelayAfterMs = 500,
            StopOnFail = true
        });

        RefreshGroupEditor();
        if (StepsGrid.Items.Count > 0)
            StepsGrid.SelectedIndex = StepsGrid.Items.Count - 1;
        MarkDirty();
    }

    private void OnDeleteStepClick(object sender, RoutedEventArgs e)
    {
        if (StepsGrid.SelectedItem is not CommandDefinition step || SelectedGroup == null) return;

        SelectedGroup.Steps.Remove(step);
        RefreshGroupEditor();
        MarkDirty();
    }

    private void OnMoveUpClick(object sender, RoutedEventArgs e)
    {
        if (StepsGrid.SelectedItem is not CommandDefinition step || SelectedGroup == null) return;

        var index = SelectedGroup.Steps.IndexOf(step);
        if (index <= 0) return;

        SelectedGroup.Steps.Move(index, index - 1);
        RefreshGroupEditor();
        StepsGrid.SelectedIndex = index - 1;
        MarkDirty();
    }

    private void OnMoveDownClick(object sender, RoutedEventArgs e)
    {
        if (StepsGrid.SelectedItem is not CommandDefinition step || SelectedGroup == null) return;

        var index = SelectedGroup.Steps.IndexOf(step);
        if (index < 0 || index >= SelectedGroup.Steps.Count - 1) return;

        SelectedGroup.Steps.Move(index, index + 1);
        RefreshGroupEditor();
        StepsGrid.SelectedIndex = index + 1;
        MarkDirty();
    }

    private async void OnSaveGroupsClick(object sender, RoutedEventArgs e)
    {
        // 先把编辑区写回当前选中的命令组
        if (SelectedGroup != null)
        {
            SelectedGroup.Name = GroupNameBox.Text.Trim();
            SelectedGroup.Category = GroupCategoryBox.Text.Trim();
            SelectedGroup.Description = GroupDescBox.Text.Trim();
            GroupListBox.Items.Refresh();
        }

        foreach (var group in _editableGroups)
        {
            if (string.IsNullOrWhiteSpace(group.Name))
            {
                System.Windows.MessageBox.Show(this, "命令组名称不能为空", "校验失败",
                    MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
        }

        // 同步到命令库
        foreach (var group in _editableGroups)
        {
            group.ApplyToSource();
            if (_library.Groups.Any(g => g.Id == group.Source.Id))
                _library.UpdateGroup(group.Source);
            else
                _library.AddGroup(group.Source);
        }
        var keptGroupIds = _editableGroups.Select(g => g.Source.Id).ToHashSet();
        foreach (var id in _library.Groups.Select(g => g.Id).Where(id => !keptGroupIds.Contains(id)).ToList())
            _library.DeleteGroup(id);

        await _library.SaveAsync();
        _isDirty = false;
        System.Windows.MessageBox.Show(this, $"已保存 {_editableGroups.Count} 个命令组", "保存成功",
            MessageBoxButton.OK, MessageBoxImage.Information);
    }

    // ==================== 标签管理 ====================

    private string? PickTag(string? current)
    {
        var dialog = new TagPickerDialog(_library.Tags.ToList(), current)
        {
            Owner = this
        };
        if (dialog.ShowDialog() == true)
            return dialog.SelectedTag;
        return null;
    }

    private void OnTagManagerClick(object sender, RoutedEventArgs e)
    {
        var dialog = new TagManagerDialog(_library.Tags.ToList())
        {
            Owner = this
        };
        dialog.ShowDialog();

        // 应用标签增删改到命令库
        var original = _library.Tags.ToList();
        var updated = dialog.Tags;

        // 删除的标签
        foreach (var tag in original.Except(updated).ToList())
            _library.DeleteTag(tag);
        // 新增的标签
        foreach (var tag in updated.Except(original))
            _library.AddTag(tag);
        // 重命名检测：原始集合与更新集合中相同位置的差异
        for (var i = 0; i < Math.Min(original.Count, updated.Count); i++)
        {
            if (original[i] != updated[i])
                _library.RenameTag(original[i], updated[i]);
        }
    }
}