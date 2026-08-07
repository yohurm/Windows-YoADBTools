namespace FactoryHelper.Models;

/// <summary>
/// 命令执行结果
/// </summary>
public class CommandResult
{
    /// <summary>执行的命令</summary>
    public string Command { get; set; } = string.Empty;

    /// <summary>目标设备序列号</summary>
    public string DeviceSerial { get; set; } = string.Empty;

    /// <summary>是否执行成功（退出码为 0）</summary>
    public bool Success { get; set; }

    /// <summary>标准输出</summary>
    public string Output { get; set; } = string.Empty;

    /// <summary>错误输出</summary>
    public string Error { get; set; } = string.Empty;

    /// <summary>耗时（毫秒）</summary>
    public long ElapsedMs { get; set; }

    /// <summary>执行时间</summary>
    public DateTime Timestamp { get; set; } = DateTime.Now;
}