namespace Yovo.Modules.AdbTerminal.Domain;

/// <summary>结果来源 — 成功/失败的判定依据（结构化，替代字符串文案）</summary>
public enum ResultSource
{
    /// <summary>输出匹配失败正则（优先级最高）</summary>
    FailureRegex,
    /// <summary>输出匹配成功正则</summary>
    SuccessRegex,
    /// <summary>退出码为 0</summary>
    ExitCode,
    /// <summary>执行超时</summary>
    Timeout,
    /// <summary>用户/系统取消</summary>
    Canceled,
    /// <summary>输入参数错误（占位符与提示数量不一致等）</summary>
    InvalidInput,
    /// <summary>进程/系统错误</summary>
    ProcessError
}

/// <summary>单条命令执行结果（结构化，供日志显示）</summary>
public class CommandResult
{
    /// <summary>完整命令（adb 前缀，含占位符替换值）</summary>
    public string Command { get; set; } = string.Empty;

    /// <summary>命令名称（组步骤为步骤名）</summary>
    public string CommandName { get; set; } = string.Empty;

    /// <summary>目标设备序列号</summary>
    public string DeviceSerial { get; set; } = string.Empty;

    /// <summary>是否成功</summary>
    public bool Success { get; set; }

    /// <summary>判定来源（失败时的原因分类）</summary>
    public ResultSource Source { get; set; }

    /// <summary>标准输出</summary>
    public string Output { get; set; } = string.Empty;

    /// <summary>错误输出（失败时的原因文案）</summary>
    public string Error { get; set; } = string.Empty;

    /// <summary>耗时（毫秒）</summary>
    public long ElapsedMs { get; set; }

    /// <summary>执行时间</summary>
    public DateTime Timestamp { get; set; } = DateTime.Now;
}
