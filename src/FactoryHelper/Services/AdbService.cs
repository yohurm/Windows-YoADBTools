using System.Diagnostics;
using System.IO;
using FactoryHelper.Models;

namespace FactoryHelper.Services;

/// <summary>
/// ADB 服务 — 负责 ADB 进程管理、设备扫描、命令执行
/// </summary>
public class AdbService
{
    private readonly string _adbPath;

    /// <summary>ADB 可执行文件路径</summary>
    public string AdbPath => _adbPath;

    public AdbService()
    {
        _adbPath = ResolveAdbPath();
    }

    /// <summary>
    /// 解析 ADB 路径：优先使用内置 ADB，其次系统 PATH
    /// </summary>
    private static string ResolveAdbPath()
    {
        // 1. 先检查内置 ADB（应用程序同目录下的 Tools 文件夹）
        var appDir = AppDomain.CurrentDomain.BaseDirectory;
        var builtin = Path.Combine(appDir, "Tools", "adb.exe");
        if (File.Exists(builtin))
            return builtin;

        // 2. 检查系统 PATH 中的 adb
        var pathDirs = Environment.GetEnvironmentVariable("PATH")?.Split(Path.PathSeparator) ?? [];
        foreach (var dir in pathDirs)
        {
            var candidate = Path.Combine(dir, "adb.exe");
            if (File.Exists(candidate))
                return candidate;
        }

        // 3. 回退到内置路径（运行时可能复制到输出目录）
        var fallback = Path.Combine(appDir, "adb.exe");
        if (File.Exists(fallback))
            return fallback;

        return builtin; // 即使不存在也返回，让调用方报错
    }

    /// <summary>
    /// 检查 ADB 是否可用
    /// </summary>
    public bool IsAvailable()
    {
        return File.Exists(_adbPath);
    }

    /// <summary>
    /// 扫描已连接的 ADB 设备
    /// </summary>
    public async Task<List<AdbDevice>> GetDevicesAsync(CancellationToken ct = default)
    {
        var result = await RunAdbAsync("devices -l", ct: ct);
        var devices = new List<AdbDevice>();

        if (!result.Success)
            return devices;

        var lines = result.Output.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        foreach (var line in lines.Skip(1)) // 跳过第一行 "List of devices attached"
        {
            // adb 输出格式: "serial  state product:... model:... device:... transport_id:N"
            // 注意: 新版 adb 用空格对齐填充，不能用 Split('\t')
            var parts = line.Trim()
                .Split([' ', '\t'], StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 2)
                continue;

            var serial = parts[0];
            var state = parts[1]; // "device" 或 "unauthorized" 等

            devices.Add(new AdbDevice
            {
                SerialNumber = serial,
                State = state
            });
        }

        return devices;
    }

    /// <summary>
    /// 获取设备详细信息（型号、Android 版本）
    /// </summary>
    public async Task<AdbDevice> GetDeviceDetailAsync(AdbDevice device, CancellationToken ct = default)
    {
        var modelResult = await RunAdbAsync($"-s {device.SerialNumber} shell getprop ro.product.model", ct: ct);
        if (modelResult.Success)
            device.Model = modelResult.Output.Trim();

        var versionResult = await RunAdbAsync($"-s {device.SerialNumber} shell getprop ro.build.version.release", ct: ct);
        if (versionResult.Success)
            device.AndroidVersion = versionResult.Output.Trim();

        return device;
    }

    /// <summary>
    /// 执行单条 ADB 命令
    /// </summary>
    public async Task<CommandResult> ExecuteCommandAsync(
        string serial, string command, int timeoutMs = 30000, CancellationToken ct = default)
    {
        var fullCommand = string.IsNullOrEmpty(serial)
            ? command
            : $"-s {serial} {command}";

        return await RunAdbAsync(fullCommand, timeoutMs, ct);
    }

    /// <summary>
    /// 执行命令组
    /// </summary>
    public async Task<List<CommandResult>> ExecuteGroupAsync(
        string serial, CommandGroup group, CancellationToken ct = default)
    {
        var results = new List<CommandResult>();

        foreach (var step in group.Steps)
        {
            ct.ThrowIfCancellationRequested();

            var result = await ExecuteCommandAsync(serial, step.Command, step.TimeoutMs, ct);
            results.Add(result);

            if (!result.Success)
            {
                // 命令组中某一步失败，可以选择停止或继续
                // 这里选择继续执行，但标记失败
            }

            if (step.DelayAfterMs > 0)
            {
                try
                {
                    await Task.Delay(step.DelayAfterMs, ct);
                }
                catch (TaskCanceledException)
                {
                    break;
                }
            }
        }

        return results;
    }

    /// <summary>
    /// 底层 ADB 进程调用
    /// </summary>
    private async Task<CommandResult> RunAdbAsync(
        string arguments, int timeoutMs = 30000, CancellationToken ct = default)
    {
        var result = new CommandResult
        {
            Command = arguments,
            Timestamp = DateTime.Now
        };

        var sw = Stopwatch.StartNew();

        try
        {
            using var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = _adbPath,
                    Arguments = arguments,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    StandardOutputEncoding = System.Text.Encoding.UTF8,
                    StandardErrorEncoding = System.Text.Encoding.UTF8
                },
                EnableRaisingEvents = true
            };

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(timeoutMs);

            process.Start();

            var outputTask = process.StandardOutput.ReadToEndAsync();
            var errorTask = process.StandardError.ReadToEndAsync();

            await process.WaitForExitAsync(cts.Token);
            await Task.WhenAll(outputTask, errorTask);

            // adb 输出为 CRLF，统一转成 \n 便于界面显示
            result.Output = NormalizeOutput(outputTask.Result);
            result.Error = NormalizeOutput(errorTask.Result);
            result.Success = process.ExitCode == 0;
        }
        catch (OperationCanceledException)
        {
            result.Success = false;
            result.Error = "命令执行超时";
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Error = $"执行异常: {ex.Message}";
        }
        finally
        {
            sw.Stop();
            result.ElapsedMs = sw.ElapsedMilliseconds;
        }

        return result;
    }

    /// <summary>
    /// 规范化 adb 输出：CRLF 转 LF，去除行尾多余空白
    /// </summary>
    private static string NormalizeOutput(string output)
    {
        if (string.IsNullOrEmpty(output))
            return output;

        return string.Join("\n",
            output.Replace("\r\n", "\n").Replace('\r', '\n')
                  .Split('\n')
                  .Select(l => l.TrimEnd()));
    }
}