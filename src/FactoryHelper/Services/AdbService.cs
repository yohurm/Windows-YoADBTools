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
    /// 解析 ADB 路径（完全自包含，不依赖外部环境）：
    /// 1. 优先使用应用目录下的 Tools/adb.exe（开发调试用）
    /// 2. 否则从嵌入资源解压到 %LOCALAPPDATA%\FactoryHelper\adb 使用
    /// </summary>
    private static string ResolveAdbPath()
    {
        // 1. 应用同目录 Tools 下已有 adb.exe（开发模式 / 手动部署）
        var appDir = AppDomain.CurrentDomain.BaseDirectory;
        var localTools = Path.Combine(appDir, "Tools", "adb.exe");
        if (File.Exists(localTools))
            return localTools;

        // 2. 从嵌入资源解压到本地用户目录（无需管理员权限，单 exe 分发场景）
        var adbDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FactoryHelper", "adb");
        var extracted = Path.Combine(adbDir, "adb.exe");
        if (!File.Exists(extracted))
            ExtractEmbeddedAdb(adbDir);

        return File.Exists(extracted) ? extracted : localTools; // 提取失败则回退报错
    }

    /// <summary>
    /// 从嵌入资源解压 adb.exe 及依赖 DLL
    /// </summary>
    private static void ExtractEmbeddedAdb(string targetDir)
    {
        try
        {
            Directory.CreateDirectory(targetDir);

            var assembly = typeof(AdbService).Assembly;
            var files = new[] { "adb.exe", "AdbWinApi.dll", "AdbWinUsbApi.dll" };

            foreach (var file in files)
            {
                var resourceName = $"FactoryHelper.Tools.{file}";
                var targetPath = Path.Combine(targetDir, file);

                // 已存在则跳过（避免每次启动都覆盖）
                if (File.Exists(targetPath))
                    continue;

                using var stream = assembly.GetManifestResourceStream(resourceName)
                    ?? throw new InvalidOperationException($"缺少嵌入资源: {resourceName}");
                using var fs = new FileStream(targetPath, FileMode.Create, FileAccess.Write);
                stream.CopyTo(fs);
            }
        }
        catch (Exception ex)
        {
            // 解压失败不抛异常，由调用方检查 IsAvailable()
            System.Diagnostics.Debug.WriteLine($"ADB 解压失败: {ex.Message}");
        }
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
        string serial, string command, int timeoutMs = 30000,
        string? successRegex = null, string? failureRegex = null, CancellationToken ct = default)
    {
        var fullCommand = string.IsNullOrEmpty(serial)
            ? command
            : $"-s {serial} {command}";

        return await RunAdbAsync(fullCommand, timeoutMs, successRegex, failureRegex, ct);
    }

    /// <summary>
    /// 执行命令组（支持每步延时、失败中断策略、步骤级进度回调）
    /// </summary>
    /// <param name="onStepCompleted">每步完成时回调（步骤序号、步骤、结果、是否将中断）</param>
    public async Task<GroupExecutionResult> ExecuteGroupAsync(
        string serial, CommandGroup group,
        Action<int, GroupStep, CommandResult, bool>? onStepCompleted = null,
        CancellationToken ct = default)
    {
        var result = new GroupExecutionResult();
        var stepIndex = 0;

        foreach (var step in group.Steps)
        {
            ct.ThrowIfCancellationRequested();
            stepIndex++;

            var stepResult = await ExecuteCommandAsync(serial, step.Command, step.TimeoutMs, step.SuccessRegex, step.FailureRegex, ct);
            result.Results.Add(stepResult);

            // 是否将因失败策略中断
            var willAbort = !stepResult.Success && step.StopOnFail;
            onStepCompleted?.Invoke(stepIndex, step, stepResult, willAbort);

            // 失败中断策略
            if (willAbort)
            {
                result.Aborted = true;
                result.AbortedStepIndex = stepIndex;
                return result; // 中断，不再执行后续步骤
            }

            // 本步延时
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

        return result;
    }

    /// <summary>
    /// 底层 ADB 进程调用
    /// </summary>
    private async Task<CommandResult> RunAdbAsync(
        string arguments, int timeoutMs = 30000,
        string? successRegex = null, string? failureRegex = null, CancellationToken ct = default)
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

            // 成功判定（优先级从高到低）:
            // 1. 输出匹配 FailureRegex → 失败（厂商工具"参数错误返回 0 但输出错误"）
            // 2. 输出匹配 SuccessRegex → 成功（厂商工具"成功返回 255 但输出正常"）
            // 3. 退出码为 0 → 成功
            result.Success = !IsRegexMatch(result.Output, failureRegex) &&
                             (IsRegexMatch(result.Output, successRegex) ||
                              process.ExitCode == 0);
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
    /// 正则匹配判定（忽略大小写，无效正则视为不匹配）
    /// </summary>
    private static bool IsRegexMatch(string output, string? regex)
    {
        if (string.IsNullOrEmpty(regex))
            return false;

        try
        {
            return System.Text.RegularExpressions.Regex.IsMatch(
                output, regex, System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        }
        catch
        {
            return false; // 正则无效时视为不匹配
        }
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