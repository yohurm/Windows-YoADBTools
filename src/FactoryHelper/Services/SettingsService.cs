using System.IO;
using System.Text.Json;

namespace FactoryHelper.Services;

/// <summary>
/// 平台级配置存储 — 按模块命名空间分文件，JSON 格式。
/// 文件位置: {AppData}/YovoAdbTools/Settings/{moduleId}.json
/// </summary>
public interface ISettingsService
{
    /// <summary>读取配置（不存在返回默认值）</summary>
    T Get<T>(string moduleId, string key, T defaultValue);

    /// <summary>写入配置</summary>
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
                // 配置损坏时回退默认值
            }
            return defaultValue;
        }
    }

    public void Set<T>(string moduleId, string key, T value)
    {
        lock (_lock)
        {
            var dict = LoadFile(moduleId);
            dict[key] = JsonSerializer.Serialize(value, JsonOptions);
            SaveFile(moduleId, dict);
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
        File.WriteAllText(path, JsonSerializer.Serialize(dict, JsonOptions));
    }

    private string GetPath(string moduleId)
    {
        var safeId = string.Concat(moduleId.Where(c => char.IsLetterOrDigit(c) || c is '-' or '_'));
        return Path.Combine(_rootDir, $"{safeId}.json");
    }
}