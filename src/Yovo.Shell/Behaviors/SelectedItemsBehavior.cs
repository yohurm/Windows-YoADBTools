using System.Collections;
using System.Collections.Specialized;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Controls;

namespace Yovo.Shell.Behaviors;

/// <summary>
/// ListBox 多选同步附加行为 — SelectedItems 与 VM 集合双向同步（P2-5）。
/// 方向 1（UI→VM）：控件选择变化 → 目标集合增量更新。
/// 方向 2（VM→UI）：目标集合变化 → 控件选中回填（服务快照回填场景）。
/// WPF 的 SelectedItems 不可绑定，本行为是唯一的桥接点。
/// </summary>
public static class SelectedItemsBehavior
{
    /// <summary>源集合 → 宿主 ListBox 弱引用表（OnSourceCollectionChanged 时定位控件）</summary>
    private static readonly ConditionalWeakTable<object, WeakReference<ListBox>> HostMap = [];

    /// <summary>重入抑制（M5）：UI→VM 与 VM→UI 互不触发（防程序化回填死循环）</summary>
    private static int _isSyncing;

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

        if (e.OldValue is INotifyCollectionChanged oldSource)
        {
            oldSource.CollectionChanged -= OnSourceCollectionChanged;
            HostMap.Remove(oldSource);
        }

        if (e.NewValue is INotifyCollectionChanged newSource)
        {
            HostMap.Add(newSource, new WeakReference<ListBox>(listBox));
            newSource.CollectionChanged += OnSourceCollectionChanged;
            SyncSourceToListBox(listBox, (IList)newSource);
            listBox.SelectionChanged += OnListBoxSelectionChanged;
        }
    }

    /// <summary>源集合变化 → 全量重同步控件选中（集合规模小（设备数），全量最可靠；M5 重入抑制）</summary>
    private static void OnSourceCollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
    {
        if (Interlocked.CompareExchange(ref _isSyncing, 1, 0) != 0)
            return;
        try
        {
            if (sender is not IList source || !HostMap.TryGetValue(source, out var reference))
                return;
            if (reference.TryGetTarget(out var listBox))
                SyncSourceToListBox(listBox, source);
        }
        finally
        {
            Interlocked.Exchange(ref _isSyncing, 0);
        }
    }

    private static void SyncSourceToListBox(ListBox listBox, IList source)
    {
        // 单选模式（Single* 模块）：SelectedItems 集合不可操作，用 SelectedItem
        if (listBox.SelectionMode == SelectionMode.Single)
        {
            listBox.SelectedItem = source.Count > 0 ? source[0] : null;
            return;
        }

        listBox.SelectedItems.Clear();
        foreach (var item in source)
        {
            if (listBox.Items.Contains(item))
                listBox.SelectedItems.Add(item);
        }
    }

    /// <summary>增量同步（UI→VM：SelectedItems 是只读集合，只能增删变化项；M5 重入抑制）</summary>
    private static void OnListBoxSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (Interlocked.CompareExchange(ref _isSyncing, 1, 0) != 0)
            return;
        try
        {
            if (sender is not ListBox listBox || GetSelectedItems(listBox) is not IList target)
                return;

            foreach (var removed in e.RemovedItems)
                target.Remove(removed);
            foreach (var added in e.AddedItems)
                target.Add(added);
        }
        finally
        {
            Interlocked.Exchange(ref _isSyncing, 0);
        }
    }
}
