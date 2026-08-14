using System.IO;
using Yovo.Platform.Settings;
using Yovo.Platform.Abstractions.Settings;
using Xunit;

namespace Yovo.Platform.Tests;

/// <summary>设置存储：读写 / 原子 / 损坏回退 / 迁移链（隔离临时目录）</summary>
public class SettingsStoreTests : IDisposable
{
    private readonly string _tempRoot;
    private readonly SettingsStore _store;

    public SettingsStoreTests()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), "yovo-settings-test", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tempRoot);
        _store = new SettingsStore(_tempRoot);
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
    public void Set_then_Get_roundtrips_typed_value()
    {
        var scope = SettingsScope.Module("adb-terminal");

        _store.Set(scope, "input.panel.width", 320);
        _store.Set(scope, "flag", true);

        Assert.Equal(320, _store.Get(scope, "input.panel.width", 0));
        Assert.True(_store.Get(scope, "flag", false));
        // 默认值回退
        Assert.Equal("默认", _store.Get(scope, "missing", "默认"));
    }

    [Fact]
    public void Corrupt_file_falls_back_to_default_without_throw()
    {
        var scope = SettingsScope.Module("corrupt");
        File.WriteAllText(Path.Combine(_tempRoot, "corrupt.json"), "{invalid json!!!");

        Assert.Equal(42, _store.Get(scope, "key", 42));
        // 写入恢复正常（损坏备份 + 新文档）
        _store.Set(scope, "key", 7);
        Assert.Equal(7, _store.Get(scope, "key", 42));
    }

    [Fact]
    public void Migrate_chain_executes_on_first_access()
    {
        var scope = SettingsScope.App;
        _store.Set(scope, "old.key", "v1");
        _store.Set(scope, "drop.me", "x");

        var migrated = new SettingsStore(_tempRoot); // 重新加载（模拟重启）
        migrated.Migrate(scope, 1, 2, m => m.Rename("old.key", "new.key"));
        migrated.Migrate(scope, 2, 3, m => m.Remove("drop.me"));

        Assert.Equal("v1", migrated.Get(scope, "new.key", ""));
        Assert.Equal("", migrated.Get(scope, "old.key", ""));
        Assert.Equal("", migrated.Get(scope, "drop.me", ""));
    }

    [Fact]
    public void Watch_emits_on_set()
    {
        var scope = SettingsScope.Module("watch");
        var received = new List<SettingsChanged>();
        using var _ = _store.Watch(scope).Subscribe(new CaptureObserver(received));

        _store.Set(scope, "a", 1);
        _store.Set(scope, "b", 2);

        Assert.Equal(["a", "b"], received.Select(e => e.Key));
    }

    private sealed class CaptureObserver(List<SettingsChanged> sink) : IObserver<SettingsChanged>
    {
        public void OnNext(SettingsChanged value) => sink.Add(value);
        public void OnError(Exception error) { }
        public void OnCompleted() { }
    }
}
