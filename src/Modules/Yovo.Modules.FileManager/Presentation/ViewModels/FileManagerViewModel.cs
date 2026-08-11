using System.Collections.ObjectModel;
using System.IO;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Yovo.Modules.FileManager.Application;
using Yovo.Modules.FileManager.Domain;
using Yovo.Platform.Abstractions;
using Yovo.Platform.Abstractions.Adb;
using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Logging;

namespace Yovo.Modules.FileManager.Presentation.ViewModels;

/// <summary>
/// 文件管理 ViewModel — 浏览/上传/下载/删除/新建目录（SingleRequired 设备 = 全局焦点）。
/// 危险操作（删除）经确认回调（View 注入 UI 确认，VM 保持可测）。
/// 传输走 TransferRunner（后台任务登记 + 进度）。
/// </summary>
public partial class FileManagerViewModel : ObservableObject
{
    private readonly RemoteFileService _files;
    private readonly TransferRunner _transfer;
    private readonly IDeviceSessionHub _hub;
    private readonly IAppLog _log;
    private readonly IUiDispatcher _ui;
    private readonly IAppLifecycle _lifecycle;

    /// <summary>危险操作确认回调（View 注入；null = 直接执行 — 测试场景）</summary>
    public Func<string, bool>? ConfirmAction { get; set; }

    /// <summary>浏览器文件对话框回调（View 注入；null = 禁用上传/下载）</summary>
    public Func<string, bool, string>? PickLocalPath { get; set; }

    public ObservableCollection<RemoteEntry> Entries { get; } = [];

    [ObservableProperty]
    private RemoteEntry? _selectedEntry;

    [ObservableProperty]
    private string _currentPathText = "/";

    [ObservableProperty]
    private string _statusText = "选择设备后浏览文件";

    [ObservableProperty]
    private bool _isBusy;

    [ObservableProperty]
    private double? _transferPercent;

    private RemotePath _currentPath = RemotePath.Root;
    private AdbDevice? _device;

    public FileManagerViewModel(
        RemoteFileService files,
        TransferRunner transfer,
        IDeviceSessionHub hub,
        IAppLog log,
        IUiDispatcher ui,
        IAppLifecycle lifecycle)
    {
        _files = files;
        _transfer = transfer;
        _hub = hub;
        _log = log;
        _ui = ui;
        _lifecycle = lifecycle;

        // 全局焦点设备变化 → 回填当前设备
        _hub.ActiveDeviceChanged += () => _ui.Post(RefreshDevice);
        _hub.SelectionChanged += _ => _ui.Post(RefreshDevice);
        RefreshDevice();
    }

    [RelayCommand]
    private async Task RefreshAsync()
    {
        if (IsBusy)
            return;
        IsBusy = true;
        try
        {
            await LoadDirectoryCoreAsync();
        }
        finally
        {
            IsBusy = false;
        }
    }

    /// <summary>
    /// 目录加载核心（无 IsBusy 门 — 操作成功后的强制刷新走此路径，H1）。
    /// 内部自身防重入（同一时间只允许一个加载）。
    /// </summary>
    private async Task LoadDirectoryCoreAsync()
    {
        if (_device is not { } device)
            return;

        StatusText = $"正在列出: {_currentPath.Value}";
        try
        {
            var entries = await _files.ListAsync(device.Serial, _currentPath);
            Entries.Clear();
            foreach (var entry in entries)
                Entries.Add(entry);
            StatusText = $"{entries.Count} 项";
        }
        catch (Exception ex)
        {
            _log.Error($"列出目录失败: {ex.Message}", FileManagerModule.ModuleId);
            StatusText = $"列出失败: {ex.Message}";
        }
    }

    [RelayCommand]
    private void NavigateUp()
    {
        if (_currentPath.Parent is { } parent)
            NavigateTo(parent);
    }

    [RelayCommand]
    private async Task OpenEntryAsync(RemoteEntry? entry)
    {
        if (entry is null)
            return;
        if (entry.IsDirectory)
            NavigateTo(entry.Path);
        else
            await DownloadAsync(entry);
    }

    /// <summary>双击目录进入 / 单击文件下载（ListView 交互在 View 层触发）</summary>
    private void NavigateTo(RemotePath path)
    {
        _currentPath = path;
        CurrentPathText = path.Value;
        _ = RefreshAsync();
    }

    [RelayCommand]
    private async Task UploadAsync()
    {
        if (PickLocalPath is not { } pick || _device is not { } device)
            return;

        var localFiles = pick("选择要上传的文件（可多选）", true)
            .Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (localFiles.Length == 0)
            return;

        IsBusy = true;
        try
        {
            foreach (var file in localFiles)
            {
                var fileName = Path.GetFileName(file);
                if (_currentPath.Combine(fileName) is not { } remote)
                {
                    StatusText = $"跳过非法文件名: {fileName}";
                    continue;
                }
                StatusText = $"正在上传: {fileName}";
                await _transfer.RunAsync(device.Serial, TransferDirection.Push, file, remote,
                    new Progress<TransferProgress>(p => TransferPercent = p.Percent),
                    LinkedToken()); // H2：退出时取消传输（Kill adb）
            }
            StatusText = $"已上传 {localFiles.Length} 个文件";
            TransferPercent = null;
            await LoadDirectoryCoreAsync(); // H1：强制刷新（不受 IsBusy 门控）
        }
        catch (Exception ex)
        {
            _log.Error($"上传失败: {ex.Message}", FileManagerModule.ModuleId);
            StatusText = $"上传失败: {ex.Message}";
        }
        finally
        {
            IsBusy = false;
        }
    }

    [RelayCommand]
    private async Task DownloadAsync(RemoteEntry? entry = null)
    {
        if (PickLocalPath is not { } pick || _device is not { } device)
            return;
        entry ??= SelectedEntry;
        if (entry is null || entry.IsDirectory)
            return;

        var localFile = pick("保存文件到本地", false);
        if (string.IsNullOrWhiteSpace(localFile))
            return;

        IsBusy = true;
        try
        {
            StatusText = $"正在下载: {entry.Name}";
            await _transfer.RunAsync(device.Serial, TransferDirection.Pull, localFile, entry.Path,
                new Progress<TransferProgress>(p => TransferPercent = p.Percent),
                LinkedToken()); // H2：退出时取消传输（Kill adb）
            StatusText = $"已下载: {entry.Name}";
            TransferPercent = null;
        }
        catch (Exception ex)
        {
            _log.Error($"下载失败: {ex.Message}", FileManagerModule.ModuleId);
            StatusText = $"下载失败: {ex.Message}";
        }
        finally
        {
            IsBusy = false;
        }
    }

    [RelayCommand]
    private async Task DeleteAsync()
    {
        if (_device is not { } device || SelectedEntry is not { } entry)
            return;

        // 危险操作：安全根校验 + 用户确认
        if (!entry.Path.IsSafeForDestructiveOps)
        {
            StatusText = "仅允许删除 /sdcard 与 /storage 内的文件（安全限制）";
            return;
        }
        if (ConfirmAction is not { } confirm || !confirm($"确定删除 \"{entry.Path.Value}\" 吗？此操作不可恢复。"))
            return;

        IsBusy = true;
        try
        {
            await _files.DeleteAsync(device.Serial, entry.Path);
            StatusText = $"已删除: {entry.Name}";
            await LoadDirectoryCoreAsync(); // H1：强制刷新
        }
        catch (Exception ex)
        {
            _log.Error($"删除失败: {ex.Message}", FileManagerModule.ModuleId);
            StatusText = $"删除失败: {ex.Message}";
        }
        finally
        {
            IsBusy = false;
        }
    }

    [RelayCommand]
    private async Task CreateDirectoryAsync()
    {
        if (_device is not { } device)
            return;

        var name = PromptForDirectoryName();
        if (string.IsNullOrWhiteSpace(name))
            return;
        // C3：目录名必须合法（拒绝 "/"、".."、"." 段）
        if (_currentPath.Combine(name) is not { } path)
        {
            StatusText = "目录名非法：不能包含 /、.. 或 . 段";
            return;
        }

        IsBusy = true;
        try
        {
            await _files.CreateDirectoryAsync(device.Serial, path);
            StatusText = $"已创建目录: {name}";
            await LoadDirectoryCoreAsync(); // H1：强制刷新
        }
        catch (Exception ex)
        {
            _log.Error($"新建目录失败: {ex.Message}", FileManagerModule.ModuleId);
            StatusText = $"新建目录失败: {ex.Message}";
        }
        finally
        {
            IsBusy = false;
        }
    }

    /// <summary>目录名输入回调（View 注入；null = 跳过）</summary>
    public Func<string>? PromptDirectoryName { get; set; }

    private string? PromptForDirectoryName() => PromptDirectoryName?.Invoke();

    /// <summary>传输令牌：应用退出信号链接（H2）</summary>
    private CancellationToken LinkedToken() => _lifecycle.ShutdownToken;

    /// <summary>全局焦点设备 → 当前设备（无设备时清空列表）</summary>
    private void RefreshDevice()
    {
        var active = _hub.ActiveDevice;
        if (active?.Serial == _device?.Serial)
            return;
        _device = active;
        StatusText = active is null ? "请选择设备" : $"设备: {active.DisplayName}";
        if (active is null)
        {
            Entries.Clear();
            CurrentPathText = "/";
            _currentPath = RemotePath.Root;
        }
        else
        {
            _ = RefreshAsync();
        }
    }
}
