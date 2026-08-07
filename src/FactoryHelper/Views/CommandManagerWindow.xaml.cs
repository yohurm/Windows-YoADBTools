using System.Collections.ObjectModel;
using System.Windows;
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

    /// <summary>保存后的命令列表（主界面刷新用）</summary>
    public List<AdbCommand> SavedCommands { get; private set; } = [];

    /// <summary>保存后的命令组列表（主界面刷新用）</summary>
    public List<CommandGroup> SavedGroups { get; private set; } = [];

    // ==================== 单条命令 ====================

    private AdbCommandEditable? _selectedCommand;
    public AdbCommandEditable? SelectedCommand
    {
        get => _selectedCommand;
        set { _selectedCommand = value; DataContext = value; }
    }

    // ==================== 命令组 ====================

    private CommandGroupEditable? _selectedGroup;
    public CommandGroupEditable? SelectedGroup
    {
        get => _selectedGroup;
        set
        {
            _selectedGroup = value;
            RefreshGroupEditor();
        }
    }

    public CommandManagerWindow(List<AdbCommand> commands, List<CommandGroup> groups)
    {
        InitializeComponent();
        _config = new ConfigService();

        foreach (var cmd in commands)
            _editableCommands.Add(AdbCommandEditable.From(cmd));

        foreach (var group in groups)
            _editableGroups.Add(CommandGroupEditable.From(group));

        CmdListBox.ItemsSource = _editableCommands;
        GroupListBox.ItemsSource = _editableGroups;
    }

    // ==================== 单条命令操作 ====================

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
    }

    private void OnDeleteCommandClick(object sender, RoutedEventArgs e)
    {
        if (SelectedCommand == null) return;

        if (MessageBox.Show(this, $"确定删除命令 \"{SelectedCommand.Name}\"？", "删除确认",
                MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes)
            return;

        _editableCommands.Remove(SelectedCommand);
        CmdListBox.SelectedItem = null;
    }

    private async void OnSaveCommandsClick(object sender, RoutedEventArgs e)
    {
        foreach (var editable in _editableCommands)
            editable.ApplyToSource();

        SavedCommands = _editableCommands.Select(x => x.Source).ToList();
        await _config.SaveCommandsAsync(SavedCommands);

        MessageBox.Show(this, $"已保存 {SavedCommands.Count} 条命令", "保存成功",
            MessageBoxButton.OK, MessageBoxImage.Information);
    }

    // ==================== 命令组操作 ====================

    private void OnGroupSelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        SelectedGroup = GroupListBox.SelectedItem as CommandGroupEditable;
    }

    /// <summary>
    /// 将选中的命令组数据加载到编辑区
    /// </summary>
    private void RefreshGroupEditor()
    {
        if (_selectedGroup == null)
        {
            GroupNameBox.Text = string.Empty;
            GroupDescBox.Text = string.Empty;
            StepsGrid.ItemsSource = null;
            return;
        }

        // 同步组名称/描述（DataContext 绑定由 Grid 负责）
        GroupNameBox.DataContext = _selectedGroup;
        GroupDescBox.DataContext = _selectedGroup;

        // 刷新步骤序号
        for (var i = 0; i < _selectedGroup.Steps.Count; i++)
            _selectedGroup.Steps[i].Index = i + 1;

        StepsGrid.ItemsSource = _selectedGroup.Steps;
    }

    private void OnNewGroupClick(object sender, RoutedEventArgs e)
    {
        var item = CommandGroupEditable.From(new CommandGroup
        {
            Name = "新命令组",
            Description = ""
        });
        _editableGroups.Add(item);
        GroupListBox.SelectedItem = item;
    }

    private void OnDeleteGroupClick(object sender, RoutedEventArgs e)
    {
        if (SelectedGroup == null) return;

        if (MessageBox.Show(this, $"确定删除命令组 \"{SelectedGroup.Name}\"？", "删除确认",
                MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes)
            return;

        _editableGroups.Remove(SelectedGroup);
        GroupListBox.SelectedItem = null;
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
        // 选中新步骤
        if (StepsGrid.Items.Count > 0)
            StepsGrid.SelectedIndex = StepsGrid.Items.Count - 1;
    }

    private void OnDeleteStepClick(object sender, RoutedEventArgs e)
    {
        if (StepsGrid.SelectedItem is not GroupStepEditable step || SelectedGroup == null) return;

        SelectedGroup.Steps.Remove(step);
        RefreshGroupEditor();
    }

    private void OnMoveUpClick(object sender, RoutedEventArgs e)
    {
        if (StepsGrid.SelectedItem is not GroupStepEditable step || SelectedGroup == null) return;

        var index = SelectedGroup.Steps.IndexOf(step);
        if (index <= 0) return;

        SelectedGroup.Steps.Move(index, index - 1);
        RefreshGroupEditor();
        StepsGrid.SelectedIndex = index - 1;
    }

    private void OnMoveDownClick(object sender, RoutedEventArgs e)
    {
        if (StepsGrid.SelectedItem is not GroupStepEditable step || SelectedGroup == null) return;

        var index = SelectedGroup.Steps.IndexOf(step);
        if (index < 0 || index >= SelectedGroup.Steps.Count - 1) return;

        SelectedGroup.Steps.Move(index, index + 1);
        RefreshGroupEditor();
        StepsGrid.SelectedIndex = index + 1;
    }

    private async void OnSaveGroupsClick(object sender, RoutedEventArgs e)
    {
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

        foreach (var group in _editableGroups)
            group.ApplyToSource();

        SavedGroups = _editableGroups.Select(g => g.Source).ToList();
        await _config.SaveCommandGroupsAsync(SavedGroups);

        MessageBox.Show(this, $"已保存 {SavedGroups.Count} 个命令组", "保存成功",
            MessageBoxButton.OK, MessageBoxImage.Information);
    }
}