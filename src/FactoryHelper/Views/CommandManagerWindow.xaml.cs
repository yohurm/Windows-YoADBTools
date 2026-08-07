using System.Collections.ObjectModel;
using System.Windows;
using FactoryHelper.Models;
using FactoryHelper.Services;

namespace FactoryHelper.Views;

/// <summary>
/// 命令库管理窗口 — 增删改单条命令
/// </summary>
public partial class CommandManagerWindow : Window
{
    private readonly ConfigService _config;
    private readonly ObservableCollection<AdbCommandEditable> _editableCommands = [];

    /// <summary>保存后的最新命令列表（主界面需要刷新用）</summary>
    public List<AdbCommand> SavedCommands { get; private set; } = [];

    private AdbCommandEditable? _selected;
    public AdbCommandEditable? Selected
    {
        get => _selected;
        set { _selected = value; DataContext = value; }
    }

    public CommandManagerWindow(List<AdbCommand> commands)
    {
        InitializeComponent();
        _config = new ConfigService();

        foreach (var cmd in commands)
            _editableCommands.Add(AdbCommandEditable.From(cmd));

        CmdListBox.ItemsSource = _editableCommands;
        CmdListBox.SelectionChanged += (_, _) => Selected = CmdListBox.SelectedItem as AdbCommandEditable;
    }

    /// <summary>新增命令</summary>
    private void OnNewClick(object sender, RoutedEventArgs e)
    {
        var item = AdbCommandEditable.From(new AdbCommand
        {
            Name = "新命令",
            Category = Selected?.Category ?? "通用",
            Command = "shell "
        });
        _editableCommands.Add(item);
        CmdListBox.SelectedItem = item;
    }

    /// <summary>删除选中命令</summary>
    private void OnDeleteClick(object sender, RoutedEventArgs e)
    {
        if (Selected == null) return;

        if (MessageBox.Show(this, $"确定删除命令 \"{Selected.Name}\"？", "删除确认",
                MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes)
            return;

        _editableCommands.Remove(Selected);
        CmdListBox.SelectedItem = null;
    }

    /// <summary>保存全部命令</summary>
    private async void OnSaveClick(object sender, RoutedEventArgs e)
    {
        foreach (var editable in _editableCommands)
            editable.ApplyToSource();

        SavedCommands = _editableCommands.Select(x => x.Source).ToList();
        await _config.SaveCommandsAsync(SavedCommands);

        MessageBox.Show(this, "命令库已保存", "保存成功",
            MessageBoxButton.OK, MessageBoxImage.Information);
    }
}