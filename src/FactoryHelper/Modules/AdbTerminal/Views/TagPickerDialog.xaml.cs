using System.Collections.ObjectModel;
using System.Windows;

namespace FactoryHelper.Modules.AdbTerminal.Views;

/// <summary>
/// 分类选择器 — 从已有分类中选一个（纯 UI 辅助，无业务逻辑）。
/// </summary>
public partial class TagPickerDialog : Window
{
    private readonly ObservableCollection<string> _tags = [];

    /// <summary>选中的标签（null 表示取消）</summary>
    public string? SelectedTag { get; private set; }

    public TagPickerDialog(List<string> tags, string? current)
    {
        InitializeComponent();

        foreach (var tag in tags)
            _tags.Add(tag);
        TagListBox.ItemsSource = _tags;

        if (current != null && _tags.Contains(current))
            TagListBox.SelectedItem = current;
    }

    private void OnSelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
        => SelectedTag = TagListBox.SelectedItem as string;

    private void OnOkClick(object sender, RoutedEventArgs e)
    {
        if (SelectedTag == null)
        {
            MessageBox.Show(this, "请选择一个分类", "提示", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        DialogResult = true;
        Close();
    }

    private void OnCancelClick(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}
