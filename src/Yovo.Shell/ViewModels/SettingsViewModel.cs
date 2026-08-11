using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Win32;
using Yovo.Platform.Abstractions;
using Yovo.Platform.Abstractions.Settings;
using Yovo.Platform.Abstractions.Tools;

namespace Yovo.Shell.ViewModels;

/// <summary>
/// 平台设置 ViewModel — ADB 路径 / 数据目录（设置页贡献，Shell 内部注册）。
/// ADB 路径保存后立即生效（IToolResolver.Refresh）；数据目录重启后生效。
/// 浏览对话框属轻量 UI 服务（无 View 类型引用），务实保留在 VM。
/// </summary>
public partial class SettingsViewModel : ObservableObject
{
    public const string AdbPathKey = "adb.path";
    public const string DataRootKey = "data.root";

    private readonly ISettingsStore _settings;
    private readonly IAppPaths _paths;
    private readonly IToolResolver _tools;

    /// <summary>ADB 可执行文件路径（空 = 自动解析）</summary>
    [ObservableProperty]
    private string _adbPath;

    /// <summary>数据目录（空 = 默认 %LOCALAPPDATA%\YovoAdbTools\data）</summary>
    [ObservableProperty]
    private string _dataDir;

    /// <summary>保存反馈消息</summary>
    [ObservableProperty]
    private string _message = string.Empty;

    public SettingsViewModel(ISettingsStore settings, IAppPaths paths, IToolResolver tools)
    {
        _settings = settings;
        _paths = paths;
        _tools = tools;

        // 当前生效值（设置值或自动解析结果；IAppPaths.DataRoot 本身即"设置或默认"）
        var overridePath = _settings.Get<string?>(SettingsScope.App, AdbPathKey, null);
        AdbPath = overridePath ?? _tools.Resolve(ToolId.Adb).ExePath;
        DataDir = _settings.Get(SettingsScope.App, DataRootKey, _paths.DataRoot) ?? _paths.DataRoot;
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

        _settings.Set<string?>(SettingsScope.App, AdbPathKey, adbValue);
        _settings.Set<string?>(SettingsScope.App, DataRootKey, dirValue);

        // ADB 路径立即生效；数据目录在启动时读取，重启后生效
        _tools.Refresh();
        var current = _tools.Resolve(ToolId.Adb);
        Message = current.IsAvailable
            ? $"已保存。ADB 路径立即生效；数据目录重启后生效。\n当前 ADB: {current.ExePath}"
            : "已保存。注意：当前 ADB 路径无效，命令执行将不可用。";
    }

    [RelayCommand]
    private void RestoreDefaults()
    {
        _settings.Set<string?>(SettingsScope.App, AdbPathKey, null);
        _settings.Set<string?>(SettingsScope.App, DataRootKey, null);

        _tools.Refresh();
        AdbPath = _tools.Resolve(ToolId.Adb).ExePath;
        DataDir = _paths.DataRoot;
        Message = "已恢复默认。数据目录重启后生效。";
    }
}
