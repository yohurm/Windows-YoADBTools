using System.Windows;
using Yovo.Platform.Abstractions.Composition;

namespace Yovo.Shell.Services;

/// <summary>
/// 视图解析器 — viewKey → View 类型（模块 Contribute 注册）→ 实例化 + 绑定 VM。
/// 契约层无 WPF 类型；本类是 Shell 内的唯一转换点。
/// </summary>
public sealed class ViewLocator(IContributionRegistry registry)
{
    /// <summary>解析视图（未注册的 viewKey 抛异常 — fail-fast）</summary>
    public FrameworkElement Resolve(string viewKey, object viewModel)
    {
        var viewType = registry.FindView(viewKey)
            ?? throw new InvalidOperationException($"未注册的视图键: {viewKey}");

        if (Activator.CreateInstance(viewType) is not FrameworkElement view)
            throw new InvalidOperationException($"视图类型不是 FrameworkElement: {viewType.FullName}");

        view.DataContext = viewModel;
        return view;
    }
}
