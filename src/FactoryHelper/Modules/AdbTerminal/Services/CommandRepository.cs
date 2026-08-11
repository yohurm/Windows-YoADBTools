using System.IO;
using FactoryHelper.Modules.AdbTerminal.Models;
using FactoryHelper.Platform;

namespace FactoryHelper.Modules.AdbTerminal.Services;

/// <summary>保存结果</summary>
public readonly record struct SaveResult(bool Success, string? Error);

/// <summary>
/// 命令仓库 — 单一数据源。
/// 加载：无文件 → 解压内置库；损坏/版本不匹配 → 备份 .bak + 恢复内置（绝不静默覆盖用户数据）。
/// 保存：原子写（临时文件 + 替换），成功才触发 LibraryChanged（批处理，单次事件）。
/// </summary>
public class CommandRepository
{
    public const int CurrentVersion = 1;

    /// <summary>命令库变更事件（仅在保存成功后触发一次）</summary>
    public event Action? LibraryChanged;

    private readonly string _configDir;
    private readonly string _libraryPath;

    public CommandRepository(AppPaths paths)
    {
        _configDir = paths.ConfigDir;
        _libraryPath = Path.Combine(_configDir, "library.json");
    }

    /// <summary>加载命令库（首次自动生成内置库；损坏自动备份恢复；旧位置配置自动迁移）</summary>
    public Task<CommandLibrary> LoadAsync()
    {
        // v4 迁移：数据目录可配置后，历史版本的 Config 在应用目录（BaseDir/Config/library.json）
        if (!File.Exists(_libraryPath))
            MigrateLegacyConfig();

        if (!File.Exists(_libraryPath))
        {
            var library = LoadBuiltin();
            TryWrite(library.ToJson());
            return Task.FromResult(library);
        }

        try
        {
            var json = File.ReadAllText(_libraryPath);
            var library = CommandLibrary.FromJson(json);
            if (library is not null && library.Version == CurrentVersion)
                return Task.FromResult(library);

            // 损坏或版本不匹配：备份后恢复内置（保留用户数据可手工找回）
            BackupCorruptFile();
            var builtin = LoadBuiltin();
            TryWrite(builtin.ToJson());
            return Task.FromResult(builtin);
        }
        catch (IOException)
        {
            // 读失败（占用/权限）：回退内置（不覆盖磁盘）
            return Task.FromResult(LoadBuiltin());
        }
    }

    /// <summary>保存命令库（原子写；成功触发 LibraryChanged）</summary>
    public async Task<SaveResult> SaveAsync(CommandLibrary library)
    {
        try
        {
            Directory.CreateDirectory(_configDir);
            var tempPath = _libraryPath + ".tmp";
            await File.WriteAllTextAsync(tempPath, library.ToJson());
            File.Replace(tempPath, _libraryPath, null); // 原子替换
        }
        catch (Exception ex)
        {
            return new SaveResult(false, ex.Message);
        }

        LibraryChanged?.Invoke();
        return new SaveResult(true, null);
    }

    // ==================== 内部 ====================

    /// <summary>迁移历史配置：应用目录 Config/library.json → 数据目录（保留用户编辑的命令库）</summary>
    private void MigrateLegacyConfig()
    {
        try
        {
            var legacy = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Config", "library.json");
            if (!File.Exists(legacy))
                return;
            Directory.CreateDirectory(_configDir);
            File.Copy(legacy, _libraryPath, overwrite: false);
        }
        catch
        {
            // 迁移失败不阻断（下次仍从内置生成）
        }
    }

    /// <summary>从嵌入资源解压内置命令库（模块自包含）</summary>
    private static CommandLibrary LoadBuiltin()
    {
        const string resourceName = "FactoryHelper.Modules.AdbTerminal.Resources.library.default.json";
        var assembly = typeof(CommandRepository).Assembly;
        using var stream = assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException($"缺少嵌入资源: {resourceName}");
        using var reader = new StreamReader(stream);
        var json = reader.ReadToEnd();
        return CommandLibrary.FromJson(json) ?? new CommandLibrary();
    }

    private void BackupCorruptFile()
    {
        try
        {
            var backup = Path.Combine(_configDir, $"library.bak-{DateTime.Now:yyyyMMdd-HHmmss}.json");
            File.Copy(_libraryPath, backup, overwrite: true);
        }
        catch
        {
            // 备份失败不阻断恢复流程
        }
    }

    private void TryWrite(string json)
    {
        try
        {
            Directory.CreateDirectory(_configDir);
            File.WriteAllText(_libraryPath, json);
        }
        catch
        {
            // 首次生成失败不阻断（下次加载仍回退内置）
        }
    }
}
