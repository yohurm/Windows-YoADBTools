using System.IO;
using Yovo.Platform.Abstractions;
using Yovo.Platform.Abstractions.Settings;
using Yovo.Platform.Abstractions.Tools;

namespace Yovo.Platform.Tools;

/// <summary>
/// 工具解析器实现 — 解析链：1 用户设置覆盖 → 2 应用旁 tools/（开发）→ 3 嵌入资源解压到 ToolsRoot。
/// （系统 PATH 默认关闭 — 保证产线可复现。）
/// Refresh() 在设置变更后重解析（adb 路径立即生效）。
/// </summary>
public class ToolResolver : IToolResolver
{
    private const string AdbPathKey = "adb.path";

    private readonly ISettingsStore _settings;
    private readonly IAppPaths _paths;
    private readonly object _lock = new();
    private readonly Dictionary<ToolId, ToolPath> _cache = [];
    private string? _adbOverride;

    public ToolResolver(ISettingsStore settings, IAppPaths paths)
    {
        _settings = settings;
        _paths = paths;
        _adbOverride = ReadAdbOverride();
    }

    public ToolPath Resolve(ToolId tool)
    {
        lock (_lock)
        {
            if (_cache.TryGetValue(tool, out var cached))
                return cached;
            var resolved = tool switch
            {
                ToolId.Adb => ResolveAdb(),
                _ => throw new ArgumentOutOfRangeException(nameof(tool), tool, "未实现的工具")
            };
            _cache[tool] = resolved;
            return resolved;
        }
    }

    public async Task EnsureExtractedAsync(ToolId tool, CancellationToken ct = default)
    {
        if (tool == ToolId.Adb)
            await ExtractEmbeddedAdbAsync(ct);
    }

    public void Refresh()
    {
        lock (_lock)
        {
            _adbOverride = ReadAdbOverride();
            _cache.Clear();
        }
    }

    // ==================== 内部 ====================

    private string? ReadAdbOverride()
        => _settings.Get<string?>(SettingsScope.App, AdbPathKey, null);

    private ToolPath ResolveAdb()
    {
        // 1. 用户设置覆盖（可指向 adb.exe 或所在目录；无效配置静默回退，不覆盖用户设置）
        if (!string.IsNullOrWhiteSpace(_adbOverride))
        {
            var exe = Directory.Exists(_adbOverride)
                ? Path.Combine(_adbOverride, "adb.exe")
                : _adbOverride;
            if (File.Exists(exe))
                return new ToolPath(exe, Path.GetDirectoryName(exe) ?? exe, true);
        }

        // 2. 应用旁 tools/（开发调试）
        var localTools = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "tools", "adb.exe");
        if (File.Exists(localTools))
            return new ToolPath(localTools, Path.GetDirectoryName(localTools) ?? localTools, true);

        // 3. 嵌入资源解压到 ToolsRoot（单文件发布场景；失败回退 IsAvailable=false）
        var extractedDir = Path.Combine(_paths.ToolsRoot, "adb");
        var extracted = Path.Combine(extractedDir, "adb.exe");
        if (!File.Exists(extracted))
        {
            try
            {
                ExtractEmbeddedAdb(extractedDir);
            }
            catch
            {
                // 解压失败不抛，由 IsAvailable 兜底
            }
        }

        return new ToolPath(extracted, extractedDir, File.Exists(extracted));
    }

    private static void ExtractEmbeddedAdb(string targetDir)
    {
        Directory.CreateDirectory(targetDir);
        var assembly = typeof(ToolResolver).Assembly;
        foreach (var file in new[] { "adb.exe", "AdbWinApi.dll", "AdbWinUsbApi.dll" })
        {
            var targetPath = Path.Combine(targetDir, file);
            if (File.Exists(targetPath))
                continue; // 已存在跳过，避免每次启动覆盖

            using var stream = assembly.GetManifestResourceStream($"Yovo.Platform.Tools.{file}")
                ?? throw new InvalidOperationException($"缺少嵌入资源: {file}");
            using var fs = new FileStream(targetPath, FileMode.Create, FileAccess.Write);
            stream.CopyTo(fs);
        }
    }

    private Task ExtractEmbeddedAdbAsync(CancellationToken ct)
    {
        var extractedDir = Path.Combine(_paths.ToolsRoot, "adb");
        return Task.Run(() =>
        {
            try
            {
                ExtractEmbeddedAdb(extractedDir);
            }
            catch
            {
                // 预解压失败不阻断（运行时 Resolve 会再尝试）
            }
        }, ct);
    }
}
