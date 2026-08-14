using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Tasks;

namespace Yovo.Platform.Abstractions.Messaging;

// ===== 平台发布的首批集成事件（模块事件如 LibraryChanged 由模块自持，不进平台） =====

/// <summary>设备目录刷新完成</summary>
public sealed record DevicesRefreshed(IReadOnlyList<AdbDevice> Devices) : IIntegrationEvent;

/// <summary>设备离线（原在线设备从目录消失）— logcat 等模块自行停止</summary>
public sealed record DeviceOffline(DeviceSerial Serial) : IIntegrationEvent;

/// <summary>全局焦点设备变化</summary>
public sealed record ActiveDeviceChanged(DeviceSerial? Serial) : IIntegrationEvent;

/// <summary>后台任务状态变化（状态栏渲染用）</summary>
public sealed record BackgroundTaskChanged(BackgroundTaskSnapshot Task) : IIntegrationEvent;
