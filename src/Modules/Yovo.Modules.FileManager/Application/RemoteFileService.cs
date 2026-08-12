using System.Text.RegularExpressions;
using Yovo.Modules.FileManager.Domain;
using Yovo.Platform.Abstractions.Adb;
using Yovo.Platform.Abstractions.Devices;

namespace Yovo.Modules.FileManager.Application;

/// <summary>
/// 远程文件服务 — 设备文件系统浏览与文件操作（短命令，IAdbCommandExecutor 切片）。
/// 输出解析为纯领域模型；成败判定（exit code）在此层收敛（非 ADB 客户端职责）。
/// </summary>
public partial class RemoteFileService(IAdbCommandExecutor adb)
{
    /// <summary>列出目录内容（adb shell ls -la；解析 权限/大小/时间/名称）</summary>
    public async Task<IReadOnlyList<RemoteEntry>> ListAsync(DeviceSerial serial, RemotePath path, CancellationToken ct = default)
    {
        var raw = await adb.ExecuteAsync(serial, $"shell ls -la {Quote(path.Value)}",
            TimeSpan.FromSeconds(10), ct);
        if (raw.ExitCode != 0)
            throw new InvalidOperationException($"列出目录失败: {raw.Error.Trim()}".Trim());

        var entries = new List<RemoteEntry>();
        foreach (var line in raw.Output.Split('\n'))
        {
            if (LsLineRegex().Match(line.Trim()) is not { Success: true } match)
                continue;

            var permissions = match.Groups["perms"].Value;
            var isDirectory = permissions.StartsWith('d');
            var sizeText = match.Groups["size"].Value;
            var name = match.Groups["name"].Value.Trim();

            if (name is "." or "..")
                continue; // 导航由路径模型负责（Parent/Combine）

            // Combine 返回 null = 名称非法（穿越/绝对段），防御性跳过（C3）
            if (path.Combine(name) is not { } childPath)
                continue;

            entries.Add(new RemoteEntry(
                name,
                childPath,
                isDirectory,
                long.TryParse(sizeText, out var size) ? size : null,
                null)); // Modified：ls -la 日期解析跨 locale 脆弱，MVP 不展示精确时间
        }

        return entries
            .OrderByDescending(e => e.IsDirectory)
            .ThenBy(e => e.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    /// <summary>删除（rm -rf；调用方负责危险确认与安全根校验）</summary>
    public Task DeleteAsync(DeviceSerial serial, RemotePath path, CancellationToken ct = default)
        => RunCheckedAsync(serial, $"shell rm -rf {Quote(path.Value)}", "删除失败", ct);

    /// <summary>新建目录（mkdir -p）</summary>
    public Task CreateDirectoryAsync(DeviceSerial serial, RemotePath path, CancellationToken ct = default)
        => RunCheckedAsync(serial, $"shell mkdir -p {Quote(path.Value)}", "新建目录失败", ct);

    /// <summary>执行并校验退出码</summary>
    private async Task RunCheckedAsync(DeviceSerial serial, string adbArgs, string failureMessage, CancellationToken ct)
    {
        var raw = await adb.ExecuteAsync(serial, adbArgs, TimeSpan.FromSeconds(15), ct);
        if (raw.ExitCode != 0)
            throw new InvalidOperationException($"{failureMessage}: {raw.Error.Trim()}".Trim());
    }

    /// <summary>shell 参数引号包裹（路径含空格）</summary>
    private static string Quote(string value) => $"'{value.Replace("'", "'\\''")}'";

    /// <summary>
    /// ls -la 行解析：权限 链接数 属主 属组 大小 日期 时间 名称（名称允许空格）。
    /// 权限位字符集含 s/S/t/T（setuid/setgid/sticky）— Android 存储大量 drwxrws---（setgid），
    /// 缺字符会导致目录行被跳过（2026-08-12 真实设备排查修复）。
    /// </summary>
    [GeneratedRegex(@"^(?<perms>[dl\-][rwxsStT\-]{9})\s+\d+\s+\S+\s+\S+\s+(?<size>\d+)\s+\S+\s+\S+\s+(?<name>.+)$", RegexOptions.Compiled)]
    private static partial Regex LsLineRegex();
}
