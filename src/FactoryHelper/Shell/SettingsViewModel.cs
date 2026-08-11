using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using FactoryHelper.Platform;
using Microsoft.Win32;

namespace FactoryHelper.Shell;

/// <summary>
/// 设置 ViewModel — 平台级配置（ADB 路径 / 数据目录）。
/// ADB 路径保存后立即生效（AdbProcessService.RefreshPath）；数据目录重启后生效。
/// 浏览对话框属轻量 UI 服务（无 View 类型引用），务实保留在 VM。
/// </summary>
public partial class SettingsViewModel : ObservableObject
{
    private readonly ISettingsService _settings;
    private readonly AdbProcessService _adb;
    private readonly AppPaths _paths;

    /// <summary>ADB 可执行文件路径（空 = 自动解析）</summary>
    [ObservableProperty]
    private string _adbPath;

    /// <summary>数据目录（空 = 默认 %LOCALAPPDATA%\YovoAdbTools）</summary>
    [ObservableProperty]
    private string _dataDir;

    /// <summary>保存反馈消息</summary>
    [ObservableProperty]
    private string _message = string.Empty;

    public SettingsViewModel(ISettingsService settings, AdbProcessService adb, AppPaths paths)
    {
        _settings = settings;
        _adb = adb;
        _paths = paths;

        // 当前生效值（设置值或自动解析结果）
        AdbPath = _paths.AdbPathOverride ?? _adb.AdbPath;
        DataDir = _paths.DataDir;
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
        // WinForms 对话框仅此一处使用，全限定避免与 WPF 类型歧义
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

        _settings.Set<string?>(AppPaths.SettingsModule, AppPaths.AdbPathKey, adbValue);
        _settings.Set<string?>(AppPaths.SettingsModule, AppPaths.DataDirKey, dirValue);

        // ADB 路径立即生效；数据目录在启动时读取，重启后生效
        _adb.RefreshPath();
        Message = _adb.IsAvailable
            ? $"已保存。ADB 路径立即生效；数据目录重启后生效。\n当前 ADB: {_adb.AdbPath}"
            : "已保存。注意：当前 ADB 路径无效，命令执行将不可用。";
    }

    [RelayCommand]
    private void RestoreDefaults()
    {
        _settings.Set<string?>(AppPaths.SettingsModule, AppPaths.AdbPathKey, null);
        _settings.Set<string?>(AppPaths.SettingsModule, AppPaths.DataDirKey, null);

        _adb.RefreshPath();
        AdbPath = _adb.AdbPath;
        DataDir = AppPaths.DefaultDataDir;
        Message = "已恢复默认。数据目录重启后生效。";
    }
}
