using Yovo.Platform.Abstractions.Devices;

namespace Yovo.Modules.LogAnalyzer.Application;

/// <summary>
/// 日志工作区（M1 F40）— 会话集合 / 当前焦点会话 / 设备绑定 / 包名 PID 重绑。
/// 域层无 UI 依赖：LogAnalyzerViewModel 订阅事件镜像到会话视图模型。
/// 规则（设计文档 §5.4/M1）：
///   - 关闭最后一个会话 → 自动重建默认 All（至少保留 1 个）；
///   - 设备切换/掉线 → 清 Package 会话 PID 追踪（避免串设备）；
///   - RefreshPidSets 由 VM 在进程索引 Changed 时调用（UI 线程，保证 PidSet 单线程访问）。
/// </summary>
public class LogWorkspace
{
    private readonly List<LogSession> _sessions = [];
    private int _nextSessionId = 1;

    /// <summary>会话集合（按创建序）</summary>
    public IReadOnlyList<LogSession> Sessions => _sessions;

    /// <summary>当前焦点会话（工具栏/快捷键作用域）</summary>
    public LogSession? ActiveSession { get; private set; }

    /// <summary>绑定设备（焦点设备；掉线/切换时同步）</summary>
    public DeviceSerial? BoundDevice { get; private set; }

    /// <summary>会话集合/焦点变化（增删、关闭重建、选中切换）</summary>
    public event Action? SessionsChanged;

    /// <summary>包名会话 PID 重绑（仅当有效集合变化 — 触发轻量重放）</summary>
    public event Action? PidSetChanged;

    /// <summary>新增会话（默认选中）</summary>
    public LogSession Add(SessionScope scope, string? packageName = null, string? exactPid = null)
    {
        var session = new LogSession($"s{_nextSessionId++}", scope, packageName, exactPid);
        _sessions.Add(session);
        ActiveSession = session;
        SessionsChanged?.Invoke();
        return session;
    }

    /// <summary>确保至少一个会话（首次进入模块，设计文档 §8.1：创建默认 All）</summary>
    public LogSession EnsureDefault()
        => _sessions.Count == 0 ? Add(SessionScope.All) : _sessions[0];

    /// <summary>关闭会话（最后一个 → 重建默认 All；焦点失效 → 邻近补位）</summary>
    public bool Close(string id)
    {
        var index = _sessions.FindIndex(s => s.Id == id);
        if (index < 0)
            return false;
        _sessions.RemoveAt(index);
        if (_sessions.Count == 0)
        {
            Add(SessionScope.All); // M1：至少保留 1 个会话
        }
        else if (ActiveSession?.Id == id)
        {
            ActiveSession = _sessions[Math.Min(index, _sessions.Count - 1)];
        }
        SessionsChanged?.Invoke();
        return true;
    }

    /// <summary>选中会话（幂等）</summary>
    public void Select(string id)
    {
        var session = _sessions.FirstOrDefault(s => s.Id == id);
        if (session is null || ReferenceEquals(session, ActiveSession))
            return;
        ActiveSession = session;
        SessionsChanged?.Invoke();
    }

    /// <summary>设备绑定/切换/掉线：清 Package 会话 PID 追踪（ADR：设备切换强制清空）</summary>
    public void BindDevice(DeviceSerial? serial)
    {
        if (BoundDevice == serial)
            return;
        BoundDevice = serial;
        foreach (var session in _sessions)
            session.ResetPidTracking();
    }

    /// <summary>
    /// 包名会话 PID 重绑（F43）— 进程索引 Changed 时由 VM 调用。
    /// 仅当某会话有效集合（绑定∪历史）变化才触发 PidSetChanged（轻量重放）。
    /// </summary>
    public void RefreshPidSets(ProcessIndexService index)
    {
        var changed = false;
        foreach (var session in _sessions)
        {
            if (session.Scope != SessionScope.Package || session.PackageName is not { } package)
                continue;
            var set = index.PidSetFor(package, session.IncludeChildProcesses);
            if (session.UpdatePidSet(set))
                changed = true;
        }
        if (changed)
            PidSetChanged?.Invoke();
    }
}
