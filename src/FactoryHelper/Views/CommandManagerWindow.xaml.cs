using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using FactoryHelper.Models;
using FactoryHelper.Services;

namespace FactoryHelper.Views;

/// <summary>
/// 命令库管理窗口 — 统一管理单条命令与命令组（增删改查）
/// </summary>
public partial class CommandManagerWindow : Window
{
    private readonly ConfigService _config;
    private readonly ObservableCollection<AdbCommandEditable> _editableCommands = [];
    private readonly ObservableCollection<CommandGroupEditable> _editableGroups = [];
    private readonly List<string> _allTags = [];

    /// <summary>保存后的命令列表（主界面刷新用）</summary>
    public List<AdbCommand> SavedCommands { get; private set; } = [];

    /// <summary>保存后的命令组列表（主界面刷新用）</summary>
    public List<CommandGroup> SavedGroups { get; private set; } = [];

    /// <summary>是否有未保存的修改</summary>
    private bool _isDirty;

    public CommandManagerWindow(List<AdbCommand> commands, List<CommandGroup> groups)
    {
        InitializeComponent();
        _config = new ConfigService();

        // 收集所有已有标签（命令分类 + 命令组分类 + 默认标签）
        _allTags = commands.Select(c => c.Category)
            .Concat(groups.Select(g => g.Category))
            .Where(c => !string.IsNullOrWhiteSpace(c))
            .Cast<string>()
            .Distinct()
            .OrderBy(t => t)
            .ToList();
        if (!_allTags.Contains("通用")) _allTags.Insert(0, "通用");
        if (!_allTags.Contains("Nori产测")) _allTags.Add("Nori产测");

        foreach (var cmd in commands)
            _editableCommands.Add(AdbCommandEditable.From(cmd));

        foreach (var group in groups)
            _editableGroups.Add(CommandGroupEditable.From(group));

        CmdListBox.ItemsSource = _editableCommands;
        GroupListBox.ItemsSource = _editableGroups;

        DataContext = null; // 初始无选中项
    }

    // ==================== 脏检查 ====================

    private void MarkDirty()
    {
        _isDirty = true;
    }

    private void OnEditChanged(object sender, TextChangedEventArgs e)
    {
        MarkDirty();
    }

    private void OnStepsGridCellEditEnding(object sender, DataGridCellEditEndingEventArgs e)
    {
        MarkDirty();
    }

    private void OnWindowClosing(object? sender, CancelEventArgs e)
    {
        if (_isDirty)
        {
            var result = MessageBox.Show(this,
                "有未保存的修改，确定要关闭吗？\n（未保存的更改将丢失）",
                "未保存修改",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning);
            if (result != MessageBoxResult.Yes)
                e.Cancel = true;
        }
    }

    // ==================== 单条命令 ====================

    private AdbCommandEditable? SelectedCommand { get; set; }

    private void OnCommandSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        SelectedCommand = CmdListBox.SelectedItem as AdbCommandEditable;
        DataContext = SelectedCommand;
    }

    private void OnNewCommandClick(object sender, RoutedEventArgs e)
    {
        var item = AdbCommandEditable.From(new AdbCommand
        {
            Name = "新命令",
            Category = SelectedCommand?.Category ?? "通用",
            Command = "shell "
        });
        _editableCommands.Add(item);
        CmdListBox.SelectedItem = item;
        MarkDirty();
    }

    private void OnDeleteCommandClick(object sender, RoutedEventArgs e)
    {
        if (SelectedCommand == null) return;

        if (MessageBox.Show(this, $"确定删除命令 \"{SelectedCommand.Name}\"？", "删除确认",
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
        foreach (var editable in _editableCommands)
            editable.ApplyToSource();

        SavedCommands = _editableCommands.Select(x => x.Source).ToList();
        await _config.SaveCommandsAsync(SavedCommands);

        _isDirty = false;
        MessageBox.Show(this, $"已保存 {SavedCommands.Count} 条命令", "保存成功",
            MessageBoxButton.OK, MessageBoxImage.Information);
    }

    // ==================== 命令组 ====================

    private CommandGroupEditable? SelectedGroup { get; set; }

    private void OnGroupSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        SelectedGroup = GroupListBox.SelectedItem as CommandGroupEditable;
        RefreshGroupEditor();
    }

    /// <summary>
    /// 将选中的命令组数据加载到编辑区
    /// </summary>
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

        for (var i = 0; i < SelectedGroup.Steps.Count; i++)
            SelectedGroup.Steps[i].Index = i + 1;

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

        if (MessageBox.Show(this, $"确定删除命令组 \"{SelectedGroup.Name}\"？", "删除确认",
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

        SelectedGroup.Steps.Add(GroupStepEditable.From(new GroupStep
        {
            Command = "shell ",
            DelayAfterMs = 500,
            StopOnFail = true
        }));

        RefreshGroupEditor();
        if (StepsGrid.Items.Count > 0)
            StepsGrid.SelectedIndex = StepsGrid.Items.Count - 1;
        MarkDirty();
    }

    private void OnDeleteStepClick(object sender, RoutedEventArgs e)
    {
        if (StepsGrid.SelectedItem is not GroupStepEditable step || SelectedGroup == null) return;

        SelectedGroup.Steps.Remove(step);
        RefreshGroupEditor();
        MarkDirty();
    }

    private void OnMoveUpClick(object sender, RoutedEventArgs e)
    {
        if (StepsGrid.SelectedItem is not GroupStepEditable step || SelectedGroup == null) return;

        var index = SelectedGroup.Steps.IndexOf(step);
        if (index <= 0) return;

        SelectedGroup.Steps.Move(index, index - 1);
        RefreshGroupEditor();
        StepsGrid.SelectedIndex = index - 1;
        MarkDirty();
    }

    private void OnMoveDownClick(object sender, RoutedEventArgs e)
    {
        if (StepsGrid.SelectedItem is not GroupStepEditable step || SelectedGroup == null) return;

        var index = SelectedGroup.Steps.IndexOf(step);
        if (index < 0 || index >= SelectedGroup.Steps.Count - 1) return;

        SelectedGroup.Steps.Move(index, index + 1);
        RefreshGroupEditor();
        StepsGrid.SelectedIndex = index + 1;
        MarkDirty();
    }

    private async void OnSaveGroupsClick(object sender, RoutedEventArgs e)
    {
        // 先把编辑区（名称/分类/描述）写回当前选中的命令组
        if (SelectedGroup != null)
        {
            SelectedGroup.Name = GroupNameBox.Text.Trim();
            SelectedGroup.Category = GroupCategoryBox.Text.Trim();
            SelectedGroup.Description = GroupDescBox.Text.Trim();
            GroupListBox.Items.Refresh();
        }

        // 校验
        foreach (var group in _editableGroups)
        {
            if (string.IsNullOrWhiteSpace(group.Name))
            {
                MessageBox.Show(this, "命令组名称不能为空", "校验失败",
                    MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
        }

        // 仅保存各自的分组（不应用当前编辑框到所有组）
        foreach (var group in _editableGroups)
            group.ApplyToSource();

        SavedGroups = _editableGroups.Select(g => g.Source).ToList();
        await _config.SaveCommandGroupsAsync(SavedGroups);

        _isDirty = false;
        MessageBox.Show(this, $"已保存 {SavedGroups.Count} 个命令组", "保存成功",
            MessageBoxButton.OK, MessageBoxImage.Information);
    }

    // ==================== 标签管理 ====================

    /// <summary>
    /// 弹出标签选择器，返回选中的标签（null 表示取消）
    /// </summary>
    private string? PickTag(string? current)
    {
        var dialog = new TagPickerDialog(_allTags, current)
        {
            Owner = this
        };
        if (dialog.ShowDialog() == true)
            return dialog.SelectedTag;
        return null;
    }

    /// <summary>
    /// 打开标签管理（增删改标签）
    /// </summary>
    private void OnTagManagerClick(object sender, RoutedEventArgs e)
    {
        var dialog = new TagManagerDialog(_allTags)
        {
            Owner = this
        };
        dialog.ShowDialog();

        // 同步标签列表
        _allTags.Clear();
        _allTags.AddRange(dialog.Tags);
    }
}