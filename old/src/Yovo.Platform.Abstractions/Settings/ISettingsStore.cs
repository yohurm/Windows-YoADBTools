namespace Yovo.Platform.Abstractions.Settings;

/// <summary>设置作用域种类</summary>
public enum SettingsScopeKind
{
    App,        // 平台级（adb.path / data.root）
    Module,     // 模块级（每模块独立 JSON 文档）
}

/// <summary>设置作用域 — 每个作用域一个 JSON 文档 + schema version</summary>
public readonly record struct SettingsScope(SettingsScopeKind Kind, string Id)
{
    public static SettingsScope App => new(SettingsScopeKind.App, "app");
    public static SettingsScope Module(string moduleId) => new(SettingsScopeKind.Module, moduleId);

    public override string ToString() => Kind == SettingsScopeKind.App ? "app" : $"module:{Id}";
}

/// <summary>设置变更通知（Watch 流元素）</summary>
public sealed record SettingsChanged(SettingsScope Scope, string Key);

/// <summary>迁移操作器 — 迁移回调内可执行的操作集合</summary>
public interface ISettingsMigration
{
    void Rename(string fromKey, string toKey);
    void Remove(string key);
    void Set<T>(string key, T value);
}

/// <summary>
/// 设置存储 — 每 scope 一个 JSON 文档（去掉 v4 的"字典套一层 JSON"双序列化）+ schema version + 迁移回调。
/// 原子写；损坏回退默认并备份；IO 异常不抛出。
/// </summary>
public interface ISettingsStore
{
    /// <summary>读取（不存在/损坏/类型不匹配返回默认值）</summary>
    T Get<T>(SettingsScope scope, string key, T defaultValue);

    /// <summary>写入（原子替换）</summary>
    void Set<T>(SettingsScope scope, string key, T value);

    /// <summary>订阅变更（key 为 null 表示 scope 内全部键）</summary>
    IObservable<SettingsChanged> Watch(SettingsScope scope, string? key = null);

    /// <summary>注册迁移：文档版本 fromVersion 时执行 migrate 并写入 toVersion（加载时惰性触发）</summary>
    void Migrate(SettingsScope scope, int fromVersion, int toVersion, Action<ISettingsMigration> migrate);
}
