using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using Yovo.Platform.Abstractions;
using Yovo.Platform.Abstractions.Settings;

namespace Yovo.Platform.Settings;

/// <summary>
/// 设置存储实现 — 每 scope 一个 JSON 文档（{version, values}），原子写，损坏备份。
/// 迁移：注册 Migrate(from→to) 回调，scope 首次访问时按版本链惰性执行并持久化。
/// IO 异常不抛出：Get 回退默认；Set 记 Debug（主流程不受影响）。
/// </summary>
public class SettingsStore : ISettingsStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    private sealed class ScopeDocument
    {
        public int Version { get; set; } = 1;
        public Dictionary<string, string> Values { get; set; } = [];
    }

    private sealed class Migration
    {
        public required int FromVersion { get; init; } // L5：fromVersion 参与匹配
        public required int ToVersion { get; init; }
        public required Action<ISettingsMigration> Action { get; init; }
    }

    private sealed class ScopeState
    {
        public int Version = 1;
        public readonly Dictionary<string, string> Values = [];
        public readonly List<Migration> Migrations = [];
        public bool Loaded;
    }

    private sealed class MigrationRunner(ScopeState state) : ISettingsMigration
    {
        public void Rename(string fromKey, string toKey)
        {
            if (state.Values.Remove(fromKey, out var value))
                state.Values[toKey] = value;
        }

        public void Remove(string key) => state.Values.Remove(key);

        public void Set<T>(string key, T value)
            => state.Values[key] = JsonSerializer.Serialize(value, JsonOptions);
    }

    private sealed class ObservableImpl<T> : IObservable<T>
    {
        private readonly List<IObserver<T>> _observers = [];
        private readonly object _lock = new();

        public IDisposable Subscribe(IObserver<T> observer)
        {
            lock (_lock)
                _observers.Add(observer);
            return new Unsubscriber(() =>
            {
                lock (_lock)
                    _observers.Remove(observer);
            });
        }

        public void Emit(T value)
        {
            IObserver<T>[] snapshot;
            lock (_lock)
                snapshot = _observers.ToArray();
            foreach (var observer in snapshot)
            {
                try
                {
                    observer.OnNext(value);
                }
                catch
                {
                    // 订阅者异常隔离：单个订阅者崩溃不影响其他订阅者与写入
                }
            }
        }
    }

    private sealed class Unsubscriber(Action action) : IDisposable
    {
        private Action? _action = action;
        public void Dispose() => Interlocked.Exchange(ref _action, null)?.Invoke();
    }

    private readonly string _settingsRoot;
    private readonly object _lock = new();
    private readonly Dictionary<SettingsScope, ScopeState> _scopes = [];
    private readonly Dictionary<SettingsScope, ObservableImpl<SettingsChanged>> _watchers = [];

    /// <summary>默认构造：平台设置根（%LOCALAPPDATA%\YovoAdbTools\settings）</summary>
    public SettingsStore() : this(DefaultPaths.SettingsRoot)
    {
    }

    /// <summary>测试注入：指定设置根（隔离测试不污染真实设置）</summary>
    public SettingsStore(string settingsRoot)
    {
        _settingsRoot = settingsRoot;
    }

    public T Get<T>(SettingsScope scope, string key, T defaultValue)
    {
        lock (_lock)
        {
            try
            {
                var state = Load(scope);
                if (state.Values.TryGetValue(key, out var json) && json != null)
                {
                    var value = JsonSerializer.Deserialize<T>(json, JsonOptions);
                    if (value != null)
                        return value;
                }
            }
            catch
            {
                // 配置损坏回退默认
            }
            return defaultValue;
        }
    }

    public void Set<T>(SettingsScope scope, string key, T value)
    {
        ObservableImpl<SettingsChanged>? watcher = null;
        lock (_lock)
        {
            try
            {
                var state = Load(scope);
                state.Values[key] = JsonSerializer.Serialize(value, JsonOptions);
                Save(scope, state);
                watcher = GetWatcher(scope);
            }
            catch
            {
                // 写失败不抛，主流程不受影响
                System.Diagnostics.Debug.WriteLine($"SettingsStore 写入失败: {scope}/{key}");
                return;
            }
        }

        // M4：观察者回调移出锁（观察者再入 Get/Set 不会死锁）
        watcher?.Emit(new SettingsChanged(scope, key));
    }

    public IObservable<SettingsChanged> Watch(SettingsScope scope, string? key = null)
    {
        var observable = GetWatcher(scope);
        if (key is null)
            return observable;
        // 按 key 过滤的弱代理
        return new FilteredObservable(observable, scope, key);
    }

    private sealed class FilteredObservable(ObservableImpl<SettingsChanged> source, SettingsScope scope, string key)
        : IObservable<SettingsChanged>
    {
        public IDisposable Subscribe(IObserver<SettingsChanged> observer)
            => source.Subscribe(new FilteredObserver(observer, scope, key));

        private sealed class FilteredObserver(IObserver<SettingsChanged> inner, SettingsScope scope, string key)
            : IObserver<SettingsChanged>
        {
            public void OnNext(SettingsChanged value)
            {
                if (value.Scope == scope && value.Key == key)
                    inner.OnNext(value);
            }

            public void OnError(Exception error) => inner.OnError(error);
            public void OnCompleted() => inner.OnCompleted();
        }
    }

    public void Migrate(SettingsScope scope, int fromVersion, int toVersion, Action<ISettingsMigration> migrate)
    {
        lock (_lock)
        {
            var state = GetState(scope);
            state.Migrations.Add(new Migration { FromVersion = fromVersion, ToVersion = toVersion, Action = migrate });
        }
    }

    // ==================== 内部 ====================

    private ScopeState GetState(SettingsScope scope)
    {
        if (!_scopes.TryGetValue(scope, out var state))
        {
            state = new ScopeState();
            _scopes[scope] = state;
        }
        return state;
    }

    private ObservableImpl<SettingsChanged> GetWatcher(SettingsScope scope)
    {
        if (!_watchers.TryGetValue(scope, out var watcher))
        {
            watcher = new ObservableImpl<SettingsChanged>();
            _watchers[scope] = watcher;
        }
        return watcher;
    }

    /// <summary>加载 scope（惰性 + 幂等）：读文件 → 执行迁移链 → 必要时持久化</summary>
    private ScopeState Load(SettingsScope scope)
    {
        var state = GetState(scope);
        if (state.Loaded)
            return state;

        var path = GetPath(scope);
        if (File.Exists(path))
        {
            try
            {
                var json = File.ReadAllText(path);
                var doc = JsonSerializer.Deserialize<ScopeDocument>(json, JsonOptions);
                if (doc is not null)
                {
                    state.Version = doc.Version;
                    foreach (var (key, value) in doc.Values)
                        state.Values[key] = value;
                }
            }
            catch
            {
                // 损坏：备份原文件，以空文档继续（用户数据可手工找回）
                TryBackup(path);
            }
        }

        // 迁移链：按 FromVersion == 当前版本匹配执行（L5；最多 100 步防死循环）
        var migrated = false;
        for (var step = 0; step < 100; step++)
        {
            var next = state.Migrations.FirstOrDefault(m => m.FromVersion == state.Version);
            if (next is null)
                break;
            next.Action(new MigrationRunner(state));
            state.Version = next.ToVersion;
            migrated = true;
        }

        if (migrated)
            Save(scope, state);

        state.Loaded = true;
        return state;
    }

    private void Save(SettingsScope scope, ScopeState state)
    {
        var path = GetPath(scope);
        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(directory))
            Directory.CreateDirectory(directory);

        var doc = new ScopeDocument
        {
            Version = state.Version,
            Values = new Dictionary<string, string>(state.Values)
        };
        var tempPath = path + ".tmp";
        File.WriteAllText(tempPath, JsonSerializer.Serialize(doc, JsonOptions));

        // 原子替换：目标已存在用 File.Replace；首次写入目标不存在则 Move
        if (File.Exists(path))
            File.Replace(tempPath, path, null);
        else
            File.Move(tempPath, path);
    }

    private static void TryBackup(string path)
    {
        try
        {
            File.Copy(path, $"{path}.bak-{DateTime.Now:yyyyMMdd-HHmmss}", overwrite: true);
        }
        catch
        {
            // 备份失败不阻断
        }
    }

    private string GetPath(SettingsScope scope)
    {
        var safeId = string.Concat(scope.Id.Where(c => char.IsLetterOrDigit(c) || c is '-' or '_'));
        return Path.Combine(_settingsRoot, $"{safeId}.json");
    }
}
