namespace Yovo.Modules.FileManager.Domain;

/// <summary>
/// 远程路径值对象 — 规范化、禁止空、拒绝穿越（C3）。
/// 路径统一 "/" 开头、无尾斜杠（根除外）；解析 "." 与 ".." 段后输出规范绝对路径。
/// 危险操作（删除）仅允许安全根（/sdcard、/storage）的严格子路径。
/// </summary>
public readonly record struct RemotePath(string Value)
{
    public static RemotePath Root => new("/");

    /// <summary>解析并规范化（解析 .. 段；空/非法返回 false）</summary>
    public static bool TryParse(string? value, out RemotePath path)
    {
        path = default;
        if (string.IsNullOrWhiteSpace(value))
            return false;
        var normalized = value.Trim().Replace('\\', '/');
        if (!normalized.StartsWith('/'))
            return false;

        var segments = new List<string>();
        foreach (var segment in normalized.Split('/', StringSplitOptions.RemoveEmptyEntries))
        {
            switch (segment)
            {
                case ".":
                    break; // 当前段忽略
                case "..":
                    if (segments.Count > 0)
                        segments.RemoveAt(segments.Count - 1); // 弹栈
                    break;
                default:
                    segments.Add(segment);
                    break;
            }
        }

        path = segments.Count == 0
            ? Root
            : new RemotePath("/" + string.Join('/', segments));
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

    /// <summary>
    /// 拼接子路径（C3：拒绝穿越 — name 不得含 "/"、".."、"." 段或为空，否则返回 null）。
    /// 返回 null 表示非法名称，调用方拒绝操作。
    /// </summary>
    public RemotePath? Combine(string name)
    {
        var child = name.Trim().Replace('\\', '/');
        if (child.Length == 0 || child.StartsWith('/') || child.EndsWith('/'))
            return null;
        if (child.Split('/', StringSplitOptions.RemoveEmptyEntries).Any(
                s => s == ".." || s == "."))
            return null;

        return new RemotePath(IsRoot ? $"/{child}" : $"{Value}/{child}");
    }

    /// <summary>
    /// 危险操作（rm/mkdir 等）安全检查：必须是安全根的严格子路径（C3/M9 收紧）。
    /// 等于 /sdcard 或 /storage 自身不允许（防止整区删除）。
    /// </summary>
    public bool IsSafeForDestructiveOps
    {
        get
        {
            if (IsRoot)
                return false;
            foreach (var root in SafeRoots)
            {
                if (Value.Equals(root, StringComparison.Ordinal))
                    return false; // 等于安全根自身 → 不允许
                if (Value.StartsWith(root + "/", StringComparison.Ordinal))
                    return true;  // 严格子路径 → 允许
            }
            return false;
        }
    }

    private static readonly string[] SafeRoots = ["/sdcard", "/storage"];

    public override string ToString() => Value;
}
