using System.Collections.ObjectModel;
using System.IO;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Yovo.Modules.LogAnalyzer.Application;

namespace Yovo.Modules.LogAnalyzer.Presentation.ViewModels;

/// <summary>
/// 会话视图模型（M1 F40/F44）— 单会话过滤栏 + 可见列表 + 暂停/重放/清空/导出。
/// 过滤字段代理到 LogSession（域模型）；任何变更 → 该会话重放缓冲（F27，会话级互不污染）。
/// 作用域互斥（§4.2）：选包名 → Scope=Package 清 PID；填 PID → Scope=Pid；清空 → All。
/// 暂停只冻本会话 UI（缓冲继续，其他会话照常刷新）。
/// </summary>
public partial class LogSessionViewModel : ObservableObject
{
    private readonly ProcessIndexService _index;
    private readonly Func<IReadOnlyList<LogcatLine>> _bufferProvider;
    private readonly int _displayLimit;
    private bool _syncingScope;

    /// <summary>包名下落实体（顶部「全部进程」哨兵 = Scope All）</summary>
    private static readonly ProcessEntry AllProcessesEntry = new(string.Empty, "全部进程", default);

    public LogSession Session { get; }

    /// <summary>可见列表（F34：连续栈帧折叠为单行）</summary>
    public ObservableCollection<DisplayLine> VisibleLines { get; } = [];

    /// <summary>级别过滤选项（含以上）</summary>
    public IReadOnlyList<string> LevelOptions { get; } = ["全部", "V", "D", "I", "W", "E", "F"];

    /// <summary>包名下拉选项（哨兵 + 进程索引全量）</summary>
    public ObservableCollection<ProcessEntry> PackageOptions { get; } = [AllProcessesEntry];

    // ==================== 过滤字段（代理 Session；变更 → 重放） ====================

    public string SelectedLevel
    {
        get => Session.MinLevel;
        set
        {
            if (Session.MinLevel == value)
                return;
            Session.MinLevel = value;
            OnPropertyChanged();
            Replay();
        }
    }

    public string TagFilter
    {
        get => Session.TagFilter;
        set
        {
            if (Session.TagFilter == value)
                return;
            Session.TagFilter = value;
            OnPropertyChanged();
            Replay();
        }
    }

    public string KeywordFilter
    {
        get => Session.KeywordFilter;
        set
        {
            if (Session.KeywordFilter == value)
                return;
            Session.KeywordFilter = value;
            OnPropertyChanged();
            Replay();
        }
    }

    // ==================== 会话状态 ====================

    [ObservableProperty]
    private bool _isPaused;

    /// <summary>可见集合中崩溃/异常信号行数（F26，会话级）</summary>
    [ObservableProperty]
    private int _signalCount;

    [ObservableProperty]
    private string _statusText = string.Empty;

    // ==================== 作用域 UI（§4.2 互斥规则） ====================

    /// <summary>包名选择（ProcessEntry；哨兵=全部进程 → Scope All）</summary>
    [ObservableProperty]
    private ProcessEntry? _selectedPackage;

    partial void OnSelectedPackageChanged(ProcessEntry? value)
    {
        if (_syncingScope)
            return;
        if (value is null || ReferenceEquals(value, AllProcessesEntry))
        {
            if (Session.Scope != SessionScope.All)
            {
                Session.ChangeScope(SessionScope.All);
                AfterScopeChanged();
            }
            return;
        }
        Session.ChangeScope(SessionScope.Package, packageName: value.ProcessName);
        AfterScopeChanged();
    }

    /// <summary>PID 输入（数字 → Pid 作用域精确匹配；清空 → 回 All）</summary>
    [ObservableProperty]
    private string _pidText = string.Empty;

    partial void OnPidTextChanged(string value)
    {
        if (_syncingScope)
            return;
        if (string.IsNullOrWhiteSpace(value))
        {
            if (Session.Scope == SessionScope.Pid)
            {
                Session.ChangeScope(SessionScope.All);
                AfterScopeChanged();
            }
            return;
        }
        if (!value.Trim().All(char.IsAsciiDigit))
        {
            StatusText = "PID 仅支持数字";
            return;
        }
        Session.ChangeScope(SessionScope.Pid, exactPid: value.Trim());
        AfterScopeChanged();
    }

    /// <summary>包含子进程（ADR-LA-008：前缀匹配 com.foo:*，默认关）</summary>
    public bool IncludeChildProcesses
    {
        get => Session.IncludeChildProcesses;
        set
        {
            if (Session.IncludeChildProcesses == value)
                return;
            Session.IncludeChildProcesses = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(BoundPidsDisplay));
            // 直接重算绑定集合（子进程开关属作用域配置）
            if (Session.Scope == SessionScope.Package && Session.PackageName is { } package)
                Session.UpdatePidSet(_index.PidSetFor(package, value));
            Replay();
        }
    }

    public bool IsPackageComboEnabled => Session.Scope != SessionScope.Pid;
    public bool IsPidBoxEnabled => Session.Scope != SessionScope.Package;
    public bool IsIncludeChildrenVisible => Session.Scope == SessionScope.Package;

    /// <summary>Package 作用域：绑定∪历史 PID 展示（PID 框只读文本）</summary>
    public string BoundPidsDisplay
        => Session.Scope == SessionScope.Package
            ? string.Join(", ", Session.EffectivePidSet.OrderBy(p => p, StringComparer.Ordinal))
            : string.Empty;

    public LogSessionViewModel(LogSession session, ProcessIndexService index,
        Func<IReadOnlyList<LogcatLine>> bufferProvider, int displayLimit)
    {
        Session = session;
        _index = index;
        _bufferProvider = bufferProvider;
        _displayLimit = displayLimit;

        // 包名会话创建即绑定当前索引快照（§8.2：立即用当前缓冲重放，不等下次索引刷新）
        if (session.Scope == SessionScope.Package && session.PackageName is { } package)
            session.UpdatePidSet(_index.PidSetFor(package, session.IncludeChildProcesses));
        RefreshPackageOptions();
        Replay(); // 新会话立即用当前缓冲重放可见区（§8.2）
    }

    // ==================== 行为 ====================

    [RelayCommand]
    private void TogglePause()
    {
        IsPaused = !IsPaused;
        StatusText = IsPaused ? "已暂停（缓冲继续，界面冻结）" : "采集恢复";
    }

    /// <summary>追加采集批次（UI 线程；暂停会话跳过 — §4.6 暂停只冻当前会话）</summary>
    public void AppendBatch(IReadOnlyList<LogcatLine> batch)
    {
        if (IsPaused)
            return;
        var filter = Session.BuildFilter();
        var visible = batch.Where(l => LogFilter.Matches(l, filter)).ToList();
        if (visible.Count == 0)
            return;

        // F34：连续栈帧折叠为单行后追加
        foreach (var display in LogStackCollapser.Collapse(visible))
        {
            VisibleLines.Add(display);
            if (VisibleLines.Count > _displayLimit)
                VisibleLines.RemoveAt(0); // 显示上限裁剪（缓冲仍全量）
        }
        SignalCount = LogSignalScanner.CountSignals(VisibleLines.Select(d => d.Primary));
    }

    /// <summary>过滤/作用域/重绑变更 → 缓冲重放（F27：尾部 displayLimit，最新优先）</summary>
    public void Replay() => ReplayFrom(_bufferProvider());

    /// <summary>从指定缓冲快照重放（测试/设备切换可传空缓冲）</summary>
    public void ReplayFrom(IReadOnlyList<LogcatLine> buffer)
    {
        var filter = Session.BuildFilter();
        var filtered = buffer.Where(l => LogFilter.Matches(l, filter)).ToList();
        var take = filtered.Count > _displayLimit
            ? filtered.GetRange(filtered.Count - _displayLimit, _displayLimit)
            : filtered;

        var collapsed = LogStackCollapser.Collapse(take);
        VisibleLines.Clear();
        foreach (var display in collapsed)
            VisibleLines.Add(display);
        SignalCount = LogSignalScanner.CountSignals(VisibleLines.Select(d => d.Primary));
    }

    /// <summary>清空本会话可见区（共享缓冲保留 — 设计文档 §5.4）</summary>
    public void ClearVisible()
    {
        VisibleLines.Clear();
        SignalCount = 0;
        StatusText = "已清空会话可见区";
    }

    /// <summary>导出本会话过滤后的缓冲快照为 txt（返回文件路径；调用方处理异常）</summary>
    public string Export(IReadOnlyList<LogcatLine> buffer, string exportDir)
    {
        Directory.CreateDirectory(exportDir);
        var safeTitle = string.Concat(Session.Title.Select(
            c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c));
        var file = Path.Combine(exportDir, $"logcat-{safeTitle}-{DateTime.Now:yyyyMMdd-HHmmss}.txt");

        var filtered = buffer.Where(l => LogFilter.Matches(l, Session.BuildFilter())).ToList();
        File.WriteAllLines(file, filtered.Select(l => l.Raw));
        return file;
    }

    /// <summary>进程索引刷新 → 重建包名下拉（保持当前选中/解析显示）</summary>
    public void RefreshPackageOptions()
    {
        PackageOptions.Clear();
        PackageOptions.Add(AllProcessesEntry);
        foreach (var entry in _index.Search(null))
            PackageOptions.Add(entry);

        _syncingScope = true;
        try
        {
            switch (Session.Scope)
            {
                case SessionScope.Package:
                    SelectedPackage = PackageOptions.FirstOrDefault(p => p.ProcessName == Session.PackageName)
                                      ?? AllProcessesEntry;
                    PidText = BoundPidsDisplay; // 重绑后同步只读 PID 列表
                    break;
                case SessionScope.Pid:
                    SelectedPackage = Session.ExactPid is { } pid
                        ? _index.FindByPid(pid) ?? AllProcessesEntry
                        : AllProcessesEntry;
                    PidText = Session.ExactPid ?? string.Empty;
                    break;
                default:
                    SelectedPackage = AllProcessesEntry;
                    break;
            }
        }
        finally
        {
            _syncingScope = false;
        }
        OnPropertyChanged(nameof(BoundPidsDisplay));
    }

    // ==================== 内部 ====================

    /// <summary>作用域切换后的统一刷新：UI 同步 + 可用性 + 重放</summary>
    private void AfterScopeChanged()
    {
        RefreshScopeUi();
        OnPropertyChanged(nameof(IsPackageComboEnabled));
        OnPropertyChanged(nameof(IsPidBoxEnabled));
        OnPropertyChanged(nameof(IsIncludeChildrenVisible));
        OnPropertyChanged(nameof(BoundPidsDisplay));
        Replay();
    }

    /// <summary>按当前作用域同步包名/PID 显示（互斥规则，程序性赋值不触发重入）</summary>
    private void RefreshScopeUi()
    {
        _syncingScope = true;
        try
        {
            switch (Session.Scope)
            {
                case SessionScope.Package:
                    SelectedPackage = PackageOptions.FirstOrDefault(p => p.ProcessName == Session.PackageName)
                                      ?? AllProcessesEntry;
                    PidText = BoundPidsDisplay; // 只读显示当前绑定 PID 列表
                    break;
                case SessionScope.Pid:
                    SelectedPackage = Session.ExactPid is { } pid
                        ? _index.FindByPid(pid) ?? AllProcessesEntry // 解析到的包名（可空）
                        : AllProcessesEntry;
                    PidText = Session.ExactPid ?? string.Empty;
                    break;
                default:
                    SelectedPackage = AllProcessesEntry;
                    PidText = string.Empty;
                    break;
            }
        }
        finally
        {
            _syncingScope = false;
        }
    }
}
