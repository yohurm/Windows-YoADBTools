using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Controls;

namespace FactoryHelper.Views;

/// <summary>
/// 标签管理对话框 — 管理命令/命令组的分组标签（增删改）
/// </summary>
public partial class TagManagerDialog : Window
{
    /// <summary>标签项</summary>
    public class TagItem
    {
        public string Name { get; set; } = string.Empty;
    }

    private readonly ObservableCollection<TagItem> _tags = [];

    /// <summary>编辑后的标签列表（有序）</summary>
    public List<string> Tags => _tags.Select(t => t.Name).ToList();

    private TagItem? _selected;
    public TagItem? Selected
    {
        get => _selected;
        set { _selected = value; TagNameBox.Text = value?.Name ?? string.Empty; }
    }

    public TagManagerDialog(List<string> tags)
    {
        InitializeComponent();

        foreach (var tag in tags)
            _tags.Add(new TagItem { Name = tag });

        TagListBox.ItemsSource = _tags;
    }

    private void OnTagSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        Selected = TagListBox.SelectedItem as TagItem;
    }

    private void OnAddClick(object sender, RoutedEventArgs e)
    {
        var name = TagNameBox.Text.Trim();
        if (string.IsNullOrEmpty(name))
        {
            MessageBox.Show(this, "请输入标签名称", "提示", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        if (_tags.Any(t => t.Name == name))
        {
            MessageBox.Show(this, $"标签 \"{name}\" 已存在", "提示", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        var item = new TagItem { Name = name };
        _tags.Add(item);
        TagListBox.SelectedItem = item;
        TagNameBox.Clear();
    }

    private void OnRenameClick(object sender, RoutedEventArgs e)
    {
        if (Selected == null)
        {
            MessageBox.Show(this, "请先选中要重命名的标签", "提示", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        var newName = TagNameBox.Text.Trim();
        if (string.IsNullOrEmpty(newName))
        {
            MessageBox.Show(this, "请输入新的标签名称", "提示", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        if (_tags.Any(t => t.Name == newName && t != Selected))
        {
            MessageBox.Show(this, $"标签 \"{newName}\" 已存在", "提示", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        Selected.Name = newName;
        TagListBox.Items.Refresh();
    }

    private void OnDeleteClick(object sender, RoutedEventArgs e)
    {
        if (Selected == null)
        {
            MessageBox.Show(this, "请先选中要删除的标签", "提示", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        if (MessageBox.Show(this, $"确定删除标签 \"{Selected.Name}\"？\n命令/命令组仍会保留，仅移除标签。",
                "删除确认", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes)
            return;

        _tags.Remove(Selected);
        TagListBox.SelectedItem = null;
        TagNameBox.Clear();
    }

    private void OnTagNameChanged(object sender, TextChangedEventArgs e)
    {
        // 输入框内容变化时不自动修改选中项，仅用于新增/重命名
    }
}