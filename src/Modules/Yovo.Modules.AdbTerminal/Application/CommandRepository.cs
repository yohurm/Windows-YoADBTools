using System.IO;
using Yovo.Modules.AdbTerminal.Domain;
using Yovo.Platform.Abstractions;
using Yovo.Platform.Abstractions.Logging;

namespace Yovo.Modules.AdbTerminal.Application;

/// <summary>保存结果</summary>
public readonly record struct SaveResult(bool Success, string? Error);

/// <summary>
/// 命令仓库 — 单一数据源（模块私有目录 data\modules\adb-terminal\config\library.json）。
/// 加载：无文件 → 解压内置库；损坏/版本不匹配 → 备份 .bak + 恢复内置（绝不静默覆盖用户数据）。
/// 保存：原子写（临时文件 + 替换），成功才触发 LibraryChanged（批处理，单次事件）。
/// 迁移：v4 用户命令库（%LOCALAPPDATA%\YovoAdbTools\Config\library.json）首次启动自动迁入（ADR-009）。
/// </summary>
public class CommandRepository
{
    public const int CurrentVersion = 1;

    /// <summary>命令库变更事件（仅在保存成功后触发一次）</summary>
    public event Action? LibraryChanged;

    private readonly string _configDir;
    private readonly string _libraryPath;
    private readonly IAppLog _log;
    private readonly string _source;

    public CommandRepository(IAppPaths paths, IAppLog log)
    {
        _configDir = paths.ModuleConfig(AdbTerminalModule.ModuleId);
        _libraryPath = Path.Combine(_configDir, "library.json");
        _log = log;
        _source = AdbTerminalModule.ModuleId;
    }

    /// <summary>加载命令库（首次自动生成内置库；旧位置自动迁移；损坏自动备份恢复）</summary>
    public async Task<CommandLibrary> LoadAsync()
    {
        if (!File.Exists(_libraryPath))
            await MigrateLegacyConfigAsync();

        if (!File.Exists(_libraryPath))
        {
            var library = LoadBuiltin();
            TryWrite(library.ToJson());
            return library;
        }

        try
        {
            var json = await File.ReadAllTextAsync(_libraryPath);
            var library = CommandLibrary.FromJson(json);
            if (library is not null && library.Version == CurrentVersion)
                return library;

            // 损坏或版本不匹配：备份后恢复内置（保留用户数据可手工找回）
            BackupCorruptFile();
            var builtin = LoadBuiltin();
            TryWrite(builtin.ToJson());
            return builtin;
        }
        catch (IOException)
        {
            // 读失败（占用/权限）：回退内置（不覆盖磁盘）
            return LoadBuiltin();
        }
    }

    /// <summary>
    /// 保存命令库（原子写；成功触发 LibraryChanged）。
    /// 原子替换兼容首写（H3）：目标存在用 File.Replace，不存在则 Move（Replace 要求目标存在）。
    /// </summary>
    public async Task<SaveResult> SaveAsync(CommandLibrary library)
    {
        try
        {
            Directory.CreateDirectory(_configDir);
            var tempPath = _libraryPath + ".tmp";
            await File.WriteAllTextAsync(tempPath, library.ToJson());
            if (File.Exists(_libraryPath))
                File.Replace(tempPath, _libraryPath, null); // 原子替换（目标已存在）
            else
                File.Move(tempPath, _libraryPath);           // 首次写入（目标不存在）
            _log.Info($"命令库已保存: {library.Commands.Count} 条命令, {library.Groups.Count} 个命令组", _source);
        }
        catch (Exception ex)
        {
            return new SaveResult(false, ex.Message);
        }

        LibraryChanged?.Invoke();
        return new SaveResult(true, null);
    }

    // ==================== 内部 ====================

    /// <summary>迁移 v4 用户命令库（保留用户编辑内容；迁移失败不阻断，仍从内置生成）</summary>
    private Task MigrateLegacyConfigAsync()
    {
        try
        {
            var legacy = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "YovoAdbTools", "Config", "library.json");
            if (!File.Exists(legacy))
                return Task.CompletedTask;
            Directory.CreateDirectory(_configDir);
            File.Copy(legacy, _libraryPath, overwrite: false);
            _log.Info("已迁移 v4 用户命令库到模块数据目录", _source);
        }
        catch
        {
            // 迁移失败不阻断（下次仍从内置生成）
        }
        return Task.CompletedTask;
    }

    /// <summary>从嵌入资源解压内置命令库（模块自包含）</summary>
    private static CommandLibrary LoadBuiltin()
    {
        const string resourceName = "Yovo.Modules.AdbTerminal.Resources.library.default.json";
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
