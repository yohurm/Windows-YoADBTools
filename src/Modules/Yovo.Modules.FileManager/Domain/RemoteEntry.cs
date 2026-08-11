namespace Yovo.Modules.FileManager.Domain;

/// <summary>远程目录项（不可变快照 — ls 解析结果）</summary>
public sealed record RemoteEntry(string Name, RemotePath Path, bool IsDirectory, long? Size, DateTimeOffset? Modified);
