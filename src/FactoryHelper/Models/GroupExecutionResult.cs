namespace FactoryHelper.Models;

/// <summary>
/// 命令组执行结果
/// </summary>
public class GroupExecutionResult
{
    /// <summary>各步骤执行结果（按顺序）</summary>
    public List<CommandResult> Results { get; set; } = [];

    /// <summary>是否因失败策略被中断（未执行完所有步骤）</summary>
    public bool Aborted { get; set; }

    /// <summary>中断时所在的步骤序号（从 1 开始，未中断为 0）</summary>
    public int AbortedStepIndex { get; set; }

    /// <summary>全部通过</summary>
    public bool AllPassed => !Aborted && Results.All(r => r.Success);
}