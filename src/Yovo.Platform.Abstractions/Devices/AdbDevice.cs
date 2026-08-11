namespace Yovo.Platform.Abstractions.Devices;

/// <summary>设备快照（不可变 record — 变化即替换 + 事件，天然线程安全）</summary>
public sealed record AdbDevice(DeviceSerial Serial, string State, string? Model)
{
    /// <summary>是否在线可用（adb devices 状态为 device）</summary>
    public bool IsOnline => State == "device";

    /// <summary>界面显示名称</summary>
    public string DisplayName => string.IsNullOrEmpty(Model) ? Serial.Value : $"{Model} ({Serial.Value})";
}
