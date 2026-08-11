using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Win32;
using Yovo.Platform.Abstractions;
using Yovo.Platform.Abstractions.Settings;
using Yovo.Platform.Abstractions.Tools;

namespace Yovo.Shell.ViewModels;

/// <summary>
/// 平台设置 ViewModel — 自底向上仅保留必要项：
/// 工具链（ADB / 数据目录）+ 日志分析运行参数（缓冲/显示/采集前清空）。
/// 键名与日志模块约定对齐（字符串常量，Shell 不引用 Modules 程序集）。
/// </summary>
public partial class SettingsViewModel : ObservableObject
{
    public const string AdbPathKey = "adb.path";
    public const string DataRootKey = "data.root";

    // 与 Yovo.Modules.LogAnalyzer 约定一致（避免 Shell → Modules 依赖）
    private const string LogModuleId = "log-analyzer";
    private const string LogBufferKey = "buffer.capacity";
    private const string LogDisplayKey = "display.limit";
    private const string LogClearOnStartKey = "clear.device.on.start";

    private static SettingsScope LogScope => SettingsScope.Module(LogModuleId);

    private readonly ISettingsStore _settings;
    private readonly IAppPaths _paths;
    private readonly IToolResolver _tools;

    [ObservableProperty]
    private string _adbPath;

    [ObservableProperty]
    private string _dataDir;

    [ObservableProperty]
    private int _logBufferCapacity;

    [ObservableProperty]
    private int _logDisplayLimit;

    [ObservableProperty]
    private bool _logClearDeviceOnStart;

    [ObservableProperty]
    private string _message = string.Empty;

    public SettingsViewModel(ISettingsStore settings, IAppPaths paths, IToolResolver tools)
    {
        _settings = settings;
        _paths = paths;
        _tools = tools;

        var overridePath = _settings.Get<string?>(SettingsScope.App, AdbPathKey, null);
        AdbPath = overridePath ?? _tools.Resolve(ToolId.Adb).ExePath;
        DataDir = _settings.Get(SettingsScope.App, DataRootKey, _paths.DataRoot) ?? _paths.DataRoot;

        LogBufferCapacity = _settings.Get(LogScope, LogBufferKey, 50_000);
        LogDisplayLimit = _settings.Get(LogScope, LogDisplayKey, 2_000);
        LogClearDeviceOnStart = _settings.Get(LogScope, LogClearOnStartKey, false);
    }

    [RelayCommand]
    private void BrowseAdbPath()
    {
        var dialog = new OpenFileDialog
        {
            Title = "选择 adb.exe",
            Filter = "adb 可执行文件|adb.exe|所有文件|*.*",
            CheckFileExists = true
        };
        if (dialog.ShowDialog() == true)
            AdbPath = dialog.FileName;
    }

    [RelayCommand]
    private void BrowseDataDir()
    {
        var dialog = new System.Windows.Forms.FolderBrowserDialog
        {
            Description = "选择数据目录（命令库/ADB 等文件存放位置）",
            UseDescriptionForTitle = true,
            SelectedPath = DataDir
        };
        if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK)
            DataDir = dialog.SelectedPath;
    }

    [RelayCommand]
    private void Save()
    {
        var adbValue = string.IsNullOrWhiteSpace(AdbPath) ? null : AdbPath.Trim();
        var dirValue = string.IsNullOrWhiteSpace(DataDir) ? null : DataDir.Trim();

        _settings.Set<string?>(SettingsScope.App, AdbPathKey, adbValue);
        _settings.Set<string?>(SettingsScope.App, DataRootKey, dirValue);

        _settings.Set(LogScope, LogBufferKey, Math.Clamp(LogBufferCapacity, 1_000, 500_000));
        _settings.Set(LogScope, LogDisplayKey, Math.Clamp(LogDisplayLimit, 500, 50_000));
        _settings.Set(LogScope, LogClearOnStartKey, LogClearDeviceOnStart);

        LogBufferCapacity = _settings.Get(LogScope, LogBufferKey, 50_000);
        LogDisplayLimit = _settings.Get(LogScope, LogDisplayKey, 2_000);

        _tools.Refresh();
        var current = _tools.Resolve(ToolId.Adb);
        Message = current.IsAvailable
            ? $"已保存。ADB 立即生效；数据目录重启生效；日志参数下次采集生效。\n当前 ADB: {current.ExePath}"
            : "已保存。注意：当前 ADB 路径无效，命令执行将不可用。";
    }

    [RelayCommand]
    private void RestoreDefaults()
    {
        _settings.Set<string?>(SettingsScope.App, AdbPathKey, null);
        _settings.Set<string?>(SettingsScope.App, DataRootKey, null);
        _settings.Set(LogScope, LogBufferKey, 50_000);
        _settings.Set(LogScope, LogDisplayKey, 2_000);
        _settings.Set(LogScope, LogClearOnStartKey, false);

        _tools.Refresh();
        AdbPath = _tools.Resolve(ToolId.Adb).ExePath;
        DataDir = _paths.DataRoot;
        LogBufferCapacity = 50_000;
        LogDisplayLimit = 2_000;
        LogClearDeviceOnStart = false;
        Message = "已恢复默认。数据目录重启后生效。";
    }
}
