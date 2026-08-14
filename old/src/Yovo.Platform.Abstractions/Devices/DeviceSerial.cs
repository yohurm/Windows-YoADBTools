namespace Yovo.Platform.Abstractions.Devices;

/// <summary>
/// 设备序列号值对象 — 禁止裸 string 满天飞。
/// record struct：值语义 + 高效；Empty 表示"无设备/全局命令"。
/// </summary>
public readonly record struct DeviceSerial(string Value)
{
    public static DeviceSerial Empty => new(string.Empty);

    public bool IsEmpty => string.IsNullOrEmpty(Value);

    public override string ToString() => Value;
}
