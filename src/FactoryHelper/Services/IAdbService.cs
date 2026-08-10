using FactoryHelper.Models;

namespace FactoryHelper.Services;

/// <summary>
/// 平台级 ADB 服务接口 — 设备连接与命令执行（进程层）。
/// 投屏、文件管理等模块通过同一接口共享设备连接。
/// </summary>
public interface IAdbService
{
    /// <summary>ADB 可执行文件路径</summary>
    string AdbPath { get; }

    /// <summary>检查 ADB 是否可用</summary>
    bool IsAvailable();

    /// <summary>扫描已连接的 ADB 设备</summary>
    Task<List<AdbDevice>> GetDevicesAsync(CancellationToken ct = default);

    /// <summary>获取设备详细信息（型号、Android 版本）</summary>
    Task<AdbDevice> GetDeviceDetailAsync(AdbDevice device, CancellationToken ct = default);

    /// <summary>执行 ADB 命令（不感知命令概念，纯进程调用 + 正则判定）</summary>
    Task<CommandResult> ExecuteCommandAsync(
        string serial, string command, int timeoutMs = 30000,
        string? successRegex = null, string? failureRegex = null, CancellationToken ct = default);
}