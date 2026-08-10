using FactoryHelper.Models;

namespace FactoryHelper.Services;

/// <summary>
/// 执行引擎 — 单条命令与命令组的统一执行入口。
/// 参数解析（占位符替换）、深拷贝、步骤级进度回调全部收敛于此。
/// </summary>
public interface IExecutionService
{
    /// <summary>执行单条命令</summary>
    Task<CommandResult> ExecuteAsync(
        string serial, CommandDefinition cmd, string[]? inputValues = null, CancellationToken ct = default);

    /// <summary>执行命令组（步骤级进度回调）</summary>
    Task<GroupExecutionResult> ExecuteGroupAsync(
        string serial, CommandGroup group, string[]? inputValues = null,
        Action<int, CommandDefinition, CommandResult, bool>? onStepCompleted = null,
        CancellationToken ct = default);
}

public class ExecutionService : IExecutionService
{
    private readonly IAdbService _adb;

    public ExecutionService(IAdbService adb)
    {
        _adb = adb;
    }

    public async Task<CommandResult> ExecuteAsync(
        string serial, CommandDefinition cmd, string[]? inputValues = null, CancellationToken ct = default)
    {
        // 占位符替换（安全替换，模板含非法花括号不崩溃）
        var resolved = inputValues is { Length: > 0 }
            ? ResolvePlaceholders(cmd.Command, inputValues)
            : cmd.Command;

        return await _adb.ExecuteCommandAsync(serial, resolved, cmd.TimeoutMs,
            cmd.SuccessRegex, cmd.FailureRegex, ct);
    }

    public async Task<GroupExecutionResult> ExecuteGroupAsync(
        string serial, CommandGroup group, string[]? inputValues = null,
        Action<int, CommandDefinition, CommandResult, bool>? onStepCompleted = null,
        CancellationToken ct = default)
    {
        // 深拷贝命令组（仅本次执行使用），将输入值替换占位符。
        // 绝不修改命令库源数据 — 否则 {0} 会被真实值永久覆盖，下次执行失效
        var executionGroup = CloneGroup(group, inputValues);

        var result = new GroupExecutionResult();
        var stepIndex = 0;

        foreach (var step in executionGroup.Steps)
        {
            ct.ThrowIfCancellationRequested();
            stepIndex++;

            var stepResult = await _adb.ExecuteCommandAsync(serial, step.Command, step.TimeoutMs,
                step.SuccessRegex, step.FailureRegex, ct);
            result.Results.Add(stepResult);

            // 是否将因失败策略中断
            var willAbort = !stepResult.Success && step.StopOnFail;
            onStepCompleted?.Invoke(stepIndex, step, stepResult, willAbort);

            if (willAbort)
            {
                result.Aborted = true;
                result.AbortedStepIndex = stepIndex;
                return result;
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

        return result;
    }

    /// <summary>
    /// 安全替换 {0} {1}... 占位符。
    /// 不用 string.Format：模板含非法花括号时 string.Format 会抛异常，
    /// 这里仅精确替换 {n} 占位符，非法花括号原样保留
    /// </summary>
    public static string ResolvePlaceholders(string template, string[] values)
    {
        var result = template;
        for (var i = 0; i < values.Length; i++)
            result = result.Replace($"{{{i}}}", values[i]);
        return result;
    }

    /// <summary>
    /// 深拷贝命令组（步骤级克隆），可选输入值替换占位符，避免污染命令库源数据
    /// </summary>
    private static CommandGroup CloneGroup(CommandGroup group, string[]? inputValues)
    {
        var valueQueue = inputValues is { Length: > 0 } ? new Queue<string>(inputValues) : null;

        return new CommandGroup
        {
            Id = group.Id,
            Name = group.Name,
            Category = group.Category,
            Description = group.Description,
            Steps = group.Steps.Select(s =>
            {
                var clone = new CommandDefinition
                {
                    Id = s.Id,
                    Name = s.Name,
                    Category = s.Category,
                    Description = s.Description,
                    Command = s.Command,
                    InputPrompts = [.. s.InputPrompts],
                    TimeoutMs = s.TimeoutMs,
                    SuccessRegex = s.SuccessRegex,
                    FailureRegex = s.FailureRegex,
                    DelayAfterMs = s.DelayAfterMs,
                    StopOnFail = s.StopOnFail
                };

                // 需要输入的步骤：从输入队列取值替换占位符
                if (clone.RequiresInput && valueQueue != null)
                {
                    var values = clone.InputPrompts.Select(_ => valueQueue.Dequeue()).ToArray();
                    clone.Command = ResolvePlaceholders(clone.Command, values);
                    clone.InputPrompts = []; // 已解析，标记无需再输入
                }

                return clone;
            }).ToList()
        };
    }
}