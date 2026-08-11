using System.Diagnostics;
using System.IO;

namespace FactoryHelper.Platform;

/// <summary>ADB 进程调用结果（纯原始输出，不做成败判定）</summary>
public sealed record AdbProcessResult(string Output, string Error, int ExitCode, long ElapsedMs);

/// <summary>
/// ADB 进程服务 — 平台级纯进程调用。
/// 只负责启动 adb.exe 并返回原始输出/退出码/耗时；成败判定是模块领域规则（CommandEvaluator），不在此层。
/// </summary>
public interface IAdbProcessService
{
    /// <summary>当前使用的 adb 可执行文件路径</summary>
    string AdbPath { get; }

    /// <summary>ADB 是否可用</summary>
    bool IsAvailable { get; }

    /// <summary>
    /// 执行 ADB 命令。
    /// 超时抛 TimeoutException；调用方取消抛 OperationCanceledException；进程启动失败抛 InvalidOperationException。
    /// </summary>
    Task<AdbProcessResult> RunAsync(string serial, string command,
        int timeoutMs = 30000, CancellationToken ct = default);
}

public class AdbProcessService : IAdbProcessService
{
    private readonly string _adbPath;

    public string AdbPath => _adbPath;
    public bool IsAvailable => File.Exists(_adbPath);

    public AdbProcessService()
    {
        _adbPath = ResolveAdbPath();
    }

    /// <summary>
    /// 解析 ADB 路径（自包含，不依赖外部环境）：
    /// 1. 优先应用目录 Tools/adb.exe（开发调试）
    /// 2. 否则从嵌入资源解压到 %LOCALAPPDATA%\YovoAdbTools\adb\ 使用
    /// </summary>
    private static string ResolveAdbPath()
    {
        var appDir = AppDomain.CurrentDomain.BaseDirectory;
        var localTools = Path.Combine(appDir, "Tools", "adb.exe");
        if (File.Exists(localTools))
            return localTools;

        var adbDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "YovoAdbTools", "adb");
        var extracted = Path.Combine(adbDir, "adb.exe");
        if (!File.Exists(extracted))
            ExtractEmbeddedAdb(adbDir);

        return File.Exists(extracted) ? extracted : localTools; // 提取失败回退（最终 IsAvailable=false）
    }

    private static void ExtractEmbeddedAdb(string targetDir)
    {
        try
        {
            Directory.CreateDirectory(targetDir);
            var assembly = typeof(AdbProcessService).Assembly;
            foreach (var file in new[] { "adb.exe", "AdbWinApi.dll", "AdbWinUsbApi.dll" })
            {
                var targetPath = Path.Combine(targetDir, file);
                if (File.Exists(targetPath))
                    continue; // 已存在跳过，避免每次启动覆盖

                var resourceName = $"FactoryHelper.Tools.{file}";
                using var stream = assembly.GetManifestResourceStream(resourceName)
                    ?? throw new InvalidOperationException($"缺少嵌入资源: {resourceName}");
                using var fs = new FileStream(targetPath, FileMode.Create, FileAccess.Write);
                stream.CopyTo(fs);
            }
        }
        catch
        {
            // 解压失败不抛，由 IsAvailable 检查兜底
        }
    }

    public async Task<AdbProcessResult> RunAsync(string serial, string command,
        int timeoutMs = 30000, CancellationToken ct = default)
    {
        if (!IsAvailable)
            throw new InvalidOperationException($"adb 不可用: {_adbPath}");

        // serial 需转义（引号包裹防空格），命令本身由模块定义保持原样直传
        var arguments = string.IsNullOrEmpty(serial)
            ? command
            : $"-s {QuoteArg(serial)} {command}";

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

        var sw = Stopwatch.StartNew();
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(timeoutMs);

        process.Start();

        var outputTask = process.StandardOutput.ReadToEndAsync();
        var errorTask = process.StandardError.ReadToEndAsync();

        try
        {
            await process.WaitForExitAsync(cts.Token);
            await Task.WhenAll(outputTask, errorTask);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            // 仅超时：强杀 adb 及衍生进程（adb shell 会衍生 shell 进程），避免残留
            try { process.Kill(true); } catch { /* 已退出则忽略 */ }
            sw.Stop();
            throw new TimeoutException($"命令执行超时 ({timeoutMs}ms): adb {arguments}");
        }
        catch (OperationCanceledException)
        {
            // 调用方取消
            try { process.Kill(true); } catch { /* 已退出则忽略 */ }
            throw;
        }
        finally
        {
            sw.Stop();
        }

        return new AdbProcessResult(
            NormalizeOutput(outputTask.Result),
            NormalizeOutput(errorTask.Result),
            process.ExitCode,
            sw.ElapsedMilliseconds);
    }

    /// <summary>参数引号包裹（序列号等含空格的参数）</summary>
    private static string QuoteArg(string value) => $"\"{value}\"";

    /// <summary>规范化输出：CRLF 转 LF，去行尾空白</summary>
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
