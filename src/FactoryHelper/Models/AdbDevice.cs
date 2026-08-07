namespace FactoryHelper.Models;

/// <summary>
/// ADB 设备信息
/// </summary>
public class AdbDevice
{
    /// <summary>设备序列号</summary>
    public string SerialNumber { get; set; } = string.Empty;

    /// <summary>设备状态：device / unauthorized / offline</summary>
    public string State { get; set; } = string.Empty;

    /// <summary>设备型号（通过 adb shell getprop ro.product.model 获取）</summary>
    public string? Model { get; set; }

    /// <summary>Android 版本</summary>
    public string? AndroidVersion { get; set; }

    /// <summary>是否在线可用</summary>
    public bool IsOnline => State == "device";

    /// <summary>界面显示名称</summary>
    public string DisplayName =>
        string.IsNullOrEmpty(Model) ? SerialNumber : $"{Model} ({SerialNumber})";
}