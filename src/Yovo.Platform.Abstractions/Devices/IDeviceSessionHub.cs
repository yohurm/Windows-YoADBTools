namespace Yovo.Platform.Abstractions.Devices;

/// <summary>设备选择模式（模块声明；Shell 设备栏按当前模块的模式决定交互）</summary>
public enum DeviceSelectionMode
{
    None,                            // 不消费设备（设置类页面）
    SingleRequired,                  // 必须一台
    SingleOptional,                  // 可有可无一台
    MultiOptional,                   // 多选并行（终端）
    MultiRequired,
}

/// <summary>按模块作用域的设备选择（不可变快照）</summary>
public sealed record DeviceSelection(DeviceSelectionMode Mode, IReadOnlyList<DeviceSerial> Serials)
{
    public static DeviceSelection Empty(DeviceSelectionMode mode) => new(mode, []);
}

/// <summary>
/// 设备会话中枢 — 全局焦点 + 每模块选择作用域。
/// 解决 v4 全局唯一多选导致的模块互相踩踏：
///   全局焦点 ActiveDevice（设备栏高亮；Single* 模块跟随）
///   模块作用域 selection（终端 Multi 多选并行）
/// 事件在发布线程触发，UI 侧用 IUiDispatcher 编组。
/// </summary>
public interface IDeviceSessionHub
{
    /// <summary>全局焦点设备（设备栏高亮；Single* 模块默认跟随）</summary>
    AdbDevice? ActiveDevice { get; }

    /// <summary>设置全局焦点（Serial 无效/离线则清空）</summary>
    void SetActiveDevice(DeviceSerial? serial);

    /// <summary>注册模块的设备选择模式（Shell 导航构建时调用）</summary>
    void SetModuleMode(string moduleId, DeviceSelectionMode mode);

    /// <summary>读取模块作用域选择</summary>
    DeviceSelection GetSelection(string moduleId);

    /// <summary>写入模块作用域选择（按模块声明模式归一化）</summary>
    void SetSelection(string moduleId, DeviceSelection selection);

    /// <summary>某模块选择变化（参数为 moduleId）</summary>
    event Action<string>? SelectionChanged;

    /// <summary>全局焦点变化</summary>
    event Action? ActiveDeviceChanged;
}
