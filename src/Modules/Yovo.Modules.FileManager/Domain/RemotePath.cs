namespace Yovo.Modules.FileManager.Domain;

/// <summary>
/// 远程路径值对象 — 规范化、禁止空。路径统一 "/" 开头、无尾斜杠（根除外）。
/// 危险操作（删除）仅允许安全根（/sdcard、/storage）内（根路径白名单）。
/// </summary>
public readonly record struct RemotePath(string Value)
{
    public static RemotePath Root => new("/");

    /// <summary>空路径无效</summary>
    public static bool TryParse(string? value, out RemotePath path)
    {
        path = default;
        if (string.IsNullOrWhiteSpace(value))
            return false;
        var normalized = value.Trim().Replace('\\', '/');
        if (!normalized.StartsWith('/'))
            return false;

        // 去尾斜杠（根除外）
        while (normalized.Length > 1 && normalized.EndsWith('/'))
            normalized = normalized[..^1];
        path = new RemotePath(normalized);
        return true;
    }

    public bool IsRoot => Value == "/";

    /// <summary>父目录（根返回 null）</summary>
    public RemotePath? Parent
    {
        get
        {
            if (IsRoot)
                return null;
            var index = Value.LastIndexOf('/');
            return index <= 0 ? Root : new RemotePath(Value[..index]);
        }
    }

    /// <summary>显示名（根显示 "/"）</summary>
    public string DisplayName => IsRoot ? "/" : Value[(Value.LastIndexOf('/') + 1)..];

    /// <summary>拼接子路径</summary>
    public RemotePath Combine(string name)
    {
        var child = name.Trim().Replace('\\', '/').TrimStart('/');
        return new RemotePath(IsRoot ? $"/{child}" : $"{Value}/{child}");
    }

    /// <summary>危险操作（rm）安全根检查：仅允许用户可见存储区</summary>
    public bool IsSafeForDestructiveOps =>
        Value.StartsWith("/sdcard", StringComparison.Ordinal) ||
        Value.StartsWith("/storage", StringComparison.Ordinal);

    public override string ToString() => Value;
}
