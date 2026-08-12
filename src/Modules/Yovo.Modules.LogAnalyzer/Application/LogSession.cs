namespace Yovo.Modules.LogAnalyzer.Application;

/// <summary>
/// 日志会话（M1 F40）— 一个独立日志视图的配置与作用域状态（Xshell 会话 Tab 对应物）。
/// 域模型（可变）：过滤字段供 VM 绑定；Package 作用域持有绑定 PID 集合与会话期历史
/// （F43：应用重启后旧 PID 行仍留在该包会话时间线中，上限 8）。
/// BuildFilter 组装 LogFilterOptions 快照供 LogFilter 纯函数消费。
/// </summary>
public sealed class LogSession
{
    private const int HistoryPidCap = 8;
    private readonly List<string> _history = [];
    private IReadOnlySet<string> _pidSet = new HashSet<string>();
    private SessionScope _scope;
    private string? _packageName;
    private string? _exactPid;

    public LogSession(string id, SessionScope scope, string? packageName = null, string? exactPid = null)
    {
        Id = id;
        _scope = scope;
        _packageName = packageName;
        _exactPid = exactPid;
        CreatedUtc = DateTimeOffset.Now;
        Title = DefaultTitle;
    }

    public string Id { get; }
    public DateTimeOffset CreatedUtc { get; }

    /// <summary>会话作用域（§4.2 互斥规则：All / Package / Pid 三态切换）</summary>
    public SessionScope Scope => _scope;

    /// <summary>Package 作用域：包名（进程索引键）</summary>
    public string? PackageName => _packageName;

    /// <summary>Pid 作用域：精确 PID（ADR-LA-007）</summary>
    public string? ExactPid => _exactPid;

    /// <summary>会话标题（Scope 派生，可重命名；作用域变更时恢复派生标题）</summary>
    public string Title { get; set; }

    /// <summary>包名作用域：当前绑定 PID 集合（进程索引刷新更新）</summary>
    public IReadOnlySet<string> PidSet => _pidSet;

    /// <summary>包名作用域：会话期历史 PID（重绑保留旧行，上限 8）</summary>
    public IReadOnlyList<string> HistoryPids => _history;

    /// <summary>包名作用域：包含子进程（ADR-LA-008：前缀匹配 com.foo:*，默认关）</summary>
    public bool IncludeChildProcesses { get; set; }

    // ==================== 过滤字段（VM 绑定；变更由会话 VM 触发重放） ====================

    public string MinLevel { get; set; } = "全部";
    public string TagFilter { get; set; } = string.Empty;
    public string KeywordFilter { get; set; } = string.Empty;

    // ==================== 行为 ====================

    /// <summary>切换作用域（§4.2）：离开 Package 时清空 PID 追踪；标题恢复派生值</summary>
    public void ChangeScope(SessionScope scope, string? packageName = null, string? exactPid = null)
    {
        if (_scope == scope && _packageName == packageName && _exactPid == exactPid)
            return;
        _scope = scope;
        _packageName = packageName;
        _exactPid = exactPid;
        if (scope != SessionScope.Package)
            ResetPidTracking();
        Title = DefaultTitle;
    }

    /// <summary>
    /// 更新绑定 PID 集合并并入历史（进程索引刷新调用）。
    /// 返回是否变化（PidSetChanged 触发轻量重放 — 设计文档 §8.2：仅当集合变化）。
    /// </summary>
    public bool UpdatePidSet(IReadOnlySet<string> current)
    {
        var before = EffectivePidSet;
        _pidSet = new HashSet<string>(current);
        foreach (var pid in current)
        {
            if (!_history.Contains(pid))
            {
                _history.Add(pid);
                if (_history.Count > HistoryPidCap)
                    _history.RemoveAt(0); // 上限裁剪（保留最近 8 个）
            }
        }
        return !before.SetEquals(EffectivePidSet);
    }

    /// <summary>设备切换/掉线：清空绑定与历史（ADR：设备切换强制清空，避免串设备）</summary>
    public void ResetPidTracking()
    {
        _pidSet = new HashSet<string>();
        _history.Clear();
    }

    /// <summary>当前过滤条件快照（含作用域；Package 合并绑定∪历史集合）</summary>
    public LogFilterOptions BuildFilter()
        => new(
            MinLevel == "全部" ? null : MinLevel,
            TagFilter,
            KeywordFilter,
            _scope,
            _scope == SessionScope.Pid ? _exactPid : null,
            _scope == SessionScope.Package ? EffectivePidSet : null);

    /// <summary>作用域派生标题</summary>
    public string DefaultTitle => _scope switch
    {
        SessionScope.Package => _packageName ?? "包名会话",
        SessionScope.Pid => $"PID {_exactPid}",
        _ => "全部日志",
    };

    /// <summary>有效匹配 PID 集合（Package 作用域：绑定∪历史；展示与过滤共用）</summary>
    public IReadOnlySet<string> EffectivePidSet
    {
        get
        {
            if (_history.Count == 0)
                return _pidSet;
            var set = new HashSet<string>(_pidSet);
            foreach (var pid in _history)
                set.Add(pid);
            return set;
        }
    }
}
