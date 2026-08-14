namespace Yovo.Modules.LogAnalyzer.Application;

/// <summary>
/// 会话作用域（M1 F40/F41/F42）— 多会话划分方式（ADR-LA-006/007）。
/// All=全部进程；Package=按包名（PID ∈ 映射集合 ∪ 历史）；Pid=精确 PID。
/// </summary>
public enum SessionScope
{
    /// <summary>全部进程（总览）</summary>
    All,

    /// <summary>按包名（进程索引映射 + 重绑历史）</summary>
    Package,

    /// <summary>精确 PID（ADR-LA-007：由「包含」升级为精确相等）</summary>
    Pid,
}
