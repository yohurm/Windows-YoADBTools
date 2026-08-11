using System.IO;
using System.Text.Json;
using Yovo.Platform.Abstractions;

namespace Yovo.Modules.LogAnalyzer.Application;

/// <summary>命名过滤预设（F31）— 级别/Tag/关键字/PID 快照</summary>
public sealed record LogPreset(string Name, string Level, string Tag, string Keyword, string Pid);

/// <summary>
/// 预设存储 — 模块数据目录 config/presets.json（原子写；损坏回退空列表）。
/// 与命令库同构：加载兜底内置空集、损坏备份、保存原子替换。
/// </summary>
public class LogPresetStore(IAppPaths paths)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    private string PresetsPath => Path.Combine(paths.ModuleConfig(LogAnalyzerModule.ModuleId), "presets.json");

    /// <summary>加载预设（损坏/缺失返回空列表）</summary>
    public IReadOnlyList<LogPreset> Load()
    {
        try
        {
            if (!File.Exists(PresetsPath))
                return [];
            var json = File.ReadAllText(PresetsPath);
            return JsonSerializer.Deserialize<List<LogPreset>>(json, JsonOptions) ?? [];
        }
        catch
        {
            // 损坏回退空列表（用户数据不静默覆盖）
            return [];
        }
    }

    /// <summary>保存（原子写；成功返回 true）</summary>
    public bool Save(IReadOnlyList<LogPreset> presets)
    {
        try
        {
            var dir = Path.GetDirectoryName(PresetsPath);
            if (!string.IsNullOrEmpty(dir))
                Directory.CreateDirectory(dir);
            var tempPath = PresetsPath + ".tmp";
            File.WriteAllText(tempPath, JsonSerializer.Serialize(presets, JsonOptions));
            if (File.Exists(PresetsPath))
                File.Replace(tempPath, PresetsPath, null);
            else
                File.Move(tempPath, PresetsPath);
            return true;
        }
        catch
        {
            return false;
        }
    }
}
