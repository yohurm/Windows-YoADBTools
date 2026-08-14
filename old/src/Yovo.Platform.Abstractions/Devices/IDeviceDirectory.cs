namespace Yovo.Platform.Abstractions.Devices;

/// <summary>
/// 设备目录 — 已连接设备的只读目录（不含"用户选择"）。
/// 与 IDeviceSessionHub 分离：目录管事实，会话管意图。
/// </summary>
public interface IDeviceDirectory
{
    /// <summary>当前设备快照（不可变）</summary>
    IReadOnlyList<AdbDevice> Devices { get; }

    /// <summary>设备列表变化（扫描完成后触发，后台线程）</summary>
    event Action? DevicesChanged;

    /// <summary>扫描设备（防重入；按 Serial 差异合并，会话选中保活）</summary>
    Task RefreshAsync(CancellationToken ct = default);

    // 二期：StartWatchAsync / StopWatchAsync（轮询或 USB 通知）
}
