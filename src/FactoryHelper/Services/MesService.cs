namespace FactoryHelper.Services;

/// <summary>
/// MES 系统接口 — 预留，暂不实现
/// </summary>
public interface IMesService
{
    /// <summary>上报测试结果</summary>
    Task<bool> ReportResultAsync(string serial, string testName, bool passed, string? detail = null);
}

/// <summary>
/// MES 服务空实现（占位）
/// </summary>
public class MesService : IMesService
{
    public Task<bool> ReportResultAsync(string serial, string testName, bool passed, string? detail = null)
    {
        // TODO: 后续对接 MES 系统时实现
        return Task.FromResult(true);
    }
}