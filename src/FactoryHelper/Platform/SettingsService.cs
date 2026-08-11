using System.IO;
using System.Text.Json;

namespace FactoryHelper.Platform;

/// <summary>
/// 平台配置存储 — 按模块命名空间分文件，JSON 格式。
/// 文件位置: %LOCALAPPDATA%\YovoAdbTools\Settings\{moduleId}.json
/// 写采用临时文件 + 原子替换；IO 异常不抛出（Get 回退默认，Set 记 Debug）。
/// </summary>
public interface ISettingsService
{
    /// <summary>读取配置（不存在/损坏返回默认值）</summary>
    T Get<T>(string moduleId, string key, T defaultValue);

    /// <summary>写入配置（原子替换）</summary>
    void Set<T>(string moduleId, string key, T value);
}

public class SettingsService : ISettingsService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    private readonly string _rootDir;
    private readonly object _lock = new();

    public SettingsService()
    {
        _rootDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "YovoAdbTools", "Settings");
        Directory.CreateDirectory(_rootDir);
    }

    public T Get<T>(string moduleId, string key, T defaultValue)
    {
        lock (_lock)
        {
            try
            {
                var dict = LoadFile(moduleId);
                if (dict.TryGetValue(key, out var json) && json != null)
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

    public void Set<T>(string moduleId, string key, T value)
    {
        lock (_lock)
        {
            try
            {
                var dict = LoadFile(moduleId);
                dict[key] = JsonSerializer.Serialize(value, JsonOptions);
                SaveFile(moduleId, dict);
            }
            catch
            {
                // 写失败不抛，主流程不受影响（Debug 输出便于排查）
                System.Diagnostics.Debug.WriteLine($"SettingsService 写入失败: {moduleId}/{key}");
            }
        }
    }

    private Dictionary<string, string> LoadFile(string moduleId)
    {
        var path = GetPath(moduleId);
        if (!File.Exists(path))
            return [];

        try
        {
            var json = File.ReadAllText(path);
            return JsonSerializer.Deserialize<Dictionary<string, string>>(json, JsonOptions) ?? [];
        }
        catch
        {
            return [];
        }
    }

    private void SaveFile(string moduleId, Dictionary<string, string> dict)
    {
        var path = GetPath(moduleId);
        var tempPath = path + ".tmp";
        File.WriteAllText(tempPath, JsonSerializer.Serialize(dict, JsonOptions));

        // 原子替换：目标已存在用 File.Replace；首次写入目标不存在则 Move（File.Replace 要求目标存在）
        if (File.Exists(path))
            File.Replace(tempPath, path, null);
        else
            File.Move(tempPath, path);
    }

    private string GetPath(string moduleId)
    {
        var safeId = string.Concat(moduleId.Where(c => char.IsLetterOrDigit(c) || c is '-' or '_'));
        return Path.Combine(_rootDir, $"{safeId}.json");
    }
}
