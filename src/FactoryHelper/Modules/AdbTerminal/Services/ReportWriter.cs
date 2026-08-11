using System.IO;
using System.Text;
using FactoryHelper.Modules.AdbTerminal.Models;
using FactoryHelper.Platform;

namespace FactoryHelper.Modules.AdbTerminal.Services;

/// <summary>
/// 测试结果报告 — 执行结果结构化落盘 CSV（产线追溯）。
/// 文件: %LOCALAPPDATA%\YovoAdbTools\Reports\test-YYYYMMDD-HHmmss.csv（每次执行一个文件）
/// 写失败不影响主流程（记日志后忽略）。
/// </summary>
public class ReportWriter
{
    private readonly ILogService _log;
    private readonly string _moduleId;
    private readonly string _reportsDir;

    public ReportWriter(ILogService log, string moduleId)
    {
        _log = log;
        _moduleId = moduleId;
        _reportsDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "YovoAdbTools", "Reports");
        Directory.CreateDirectory(_reportsDir);
    }

    /// <summary>写入一次执行的结果集（命令组或单条命令）</summary>
    public async Task WriteAsync(string sessionName, IReadOnlyList<CommandResult> results)
    {
        if (results.Count == 0)
            return;

        var file = Path.Combine(_reportsDir, $"test-{DateTime.Now:yyyyMMdd-HHmmss}.csv");
        var sb = new StringBuilder();
        sb.AppendLine("时间,设备,会话,命令名,命令,结果,判定,耗时ms,输出");

        foreach (var r in results)
        {
            sb.Append(Csv(r.Timestamp.ToString("yyyy-MM-dd HH:mm:ss"))).Append(',')
              .Append(Csv(r.DeviceSerial)).Append(',')
              .Append(Csv(sessionName)).Append(',')
              .Append(Csv(r.CommandName)).Append(',')
              .Append(Csv(r.Command)).Append(',')
              .Append(r.Success ? "通过" : "失败").Append(',')
              .Append(r.Source).Append(',')
              .Append(r.ElapsedMs).Append(',')
              .Append(Csv(r.Success ? r.Output : r.Error))
              .AppendLine();
        }

        try
        {
            // UTF-8 BOM：Excel 直接打开中文不乱码
            await File.WriteAllTextAsync(file, sb.ToString(), new UTF8Encoding(true));
            _log.Info($"测试结果已保存: {file}", _moduleId);
        }
        catch (Exception ex)
        {
            _log.Error($"测试结果保存失败: {ex.Message}", _moduleId);
        }
    }

    /// <summary>CSV 字段转义（含逗号/引号/换行时引号包裹）</summary>
    private static string Csv(string? value)
    {
        if (string.IsNullOrEmpty(value))
            return string.Empty;
        if (value.Contains(',') || value.Contains('"') || value.Contains('\n'))
            return "\"" + value.Replace("\"", "\"\"") + "\"";
        return value;
    }
}
