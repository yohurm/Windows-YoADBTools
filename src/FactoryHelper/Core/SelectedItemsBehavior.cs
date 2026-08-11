using System.Collections;
using System.Windows;
using System.Windows.Controls;

namespace FactoryHelper.Core;

/// <summary>
/// ListBox 多选同步附加行为 — 将 SelectedItems 双向绑定到 VM 集合。
/// WPF 的 SelectedItems 不可绑定，本行为是唯一的桥接点（替代 code-behind 手动同步）。
/// 用法: beh:SelectedItemsBehavior.SelectedItems="{Binding SelectedDevices}"
/// </summary>
public static class SelectedItemsBehavior
{
    public static readonly DependencyProperty SelectedItemsProperty =
        DependencyProperty.RegisterAttached(
            "SelectedItems", typeof(IList), typeof(SelectedItemsBehavior),
            new FrameworkPropertyMetadata(null, OnSelectedItemsChanged));

    public static IList? GetSelectedItems(DependencyObject obj) => (IList?)obj.GetValue(SelectedItemsProperty);

    public static void SetSelectedItems(DependencyObject obj, IList? value) => obj.SetValue(SelectedItemsProperty, value);

    private static void OnSelectedItemsChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is not ListBox listBox)
            return;

        listBox.SelectionChanged -= OnListBoxSelectionChanged;

        if (e.NewValue is IList target)
        {
            // 绑定建立时：把控件当前选中项同步进目标集合
            target.Clear();
            foreach (var item in listBox.SelectedItems.Cast<object>().ToList())
                target.Add(item);
            listBox.SelectionChanged += OnListBoxSelectionChanged;
        }
    }

    /// <summary>增量同步（SelectedItems 是只读集合，只能增删变化项）</summary>
    private static void OnListBoxSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (sender is not ListBox listBox || GetSelectedItems(listBox) is not IList target)
            return;

        foreach (var removed in e.RemovedItems)
            target.Remove(removed);
        foreach (var added in e.AddedItems)
            target.Add(added);
    }
}
