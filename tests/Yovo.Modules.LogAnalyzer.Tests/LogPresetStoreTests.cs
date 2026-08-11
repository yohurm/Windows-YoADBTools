using System.IO;
using Yovo.Modules.LogAnalyzer.Application;
using Yovo.Platform.Abstractions;
using Xunit;

namespace Yovo.Modules.LogAnalyzer.Tests;

/// <summary>预设存储（F31）：保存/加载/损坏回退（隔离临时目录）</summary>
public class LogPresetStoreTests : IDisposable
{
    private readonly string _tempRoot;
    private readonly LogPresetStore _store;

    public LogPresetStoreTests()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), "yovo-preset-test", Guid.NewGuid().ToString("N"));
        _store = new LogPresetStore(new TestPaths(_tempRoot));
    }

    public void Dispose()
    {
        try
        {
            Directory.Delete(_tempRoot, recursive: true);
        }
        catch
        {
            // 清理失败忽略
        }
    }

    [Fact]
    public void Load_empty_when_no_file()
    {
        Assert.Empty(_store.Load());
    }

    [Fact]
    public void Save_then_Load_roundtrips_presets()
    {
        var presets = new[]
        {
            new LogPreset("崩溃", "E", "AndroidRuntime", "FATAL", "123"),
            new LogPreset("全部", "全部", "", "", ""),
        };

        Assert.True(_store.Save(presets));

        var loaded = _store.Load();
        Assert.Equal(2, loaded.Count);
        Assert.Equal("崩溃", loaded[0].Name);
        Assert.Equal("E", loaded[0].Level);
        Assert.Equal("FATAL", loaded[0].Keyword);
        Assert.Equal("123", loaded[0].Pid);
    }

    [Fact]
    public void Corrupt_file_falls_back_to_empty_without_throw()
    {
        var dir = Path.Combine(_tempRoot, "modules", "log-analyzer", "config");
        Directory.CreateDirectory(dir);
        File.WriteAllText(Path.Combine(dir, "presets.json"), "{not valid json");

        Assert.Empty(_store.Load());
        // 覆盖损坏文件后可正常保存
        Assert.True(_store.Save([new LogPreset("恢复", "全部", "", "", "")]));
        Assert.Single(_store.Load());
    }

    /// <summary>测试用 IAppPaths（指向临时目录）</summary>
    private sealed class TestPaths(string root) : IAppPaths
    {
        public string SettingsRoot => Path.Combine(root, "settings");
        public string DataRoot => Path.Combine(root, "data");
        public string ToolsRoot => Path.Combine(DataRoot, "tools");
        public string CacheRoot => Path.Combine(DataRoot, "cache");
        public string TempRoot => Path.Combine(DataRoot, "temp");
        public string ModuleData(string moduleId) => Path.Combine(DataRoot, "modules", moduleId);
        public string ModuleConfig(string moduleId) => Path.Combine(ModuleData(moduleId), "config");
    }
}
