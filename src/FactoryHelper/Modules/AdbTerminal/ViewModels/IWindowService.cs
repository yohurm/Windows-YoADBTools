namespace FactoryHelper.Modules.AdbTerminal.ViewModels;

/// <summary>
/// 窗口服务 — VM 打开对话框的唯一通道（VM 不 new View、不引用 Window 类型）。
/// 实现位于模块 Views 层。
/// </summary>
public interface IWindowService
{
    /// <summary>打开命令库管理窗口（模态）</summary>
    bool? ShowCommandManager(CommandManagerViewModel viewModel);

    /// <summary>选择分类标签（模态；返回选中的标签，取消返回 null）</summary>
    string? PickTag(IReadOnlyList<string> tags, string? current);
}
