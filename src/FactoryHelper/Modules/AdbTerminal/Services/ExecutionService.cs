using FactoryHelper.Modules.AdbTerminal.Models;
using FactoryHelper.Platform;

namespace FactoryHelper.Modules.AdbTerminal.Services;

/// <summary>
/// 执行引擎 — 单条命令与命令组的统一执行入口。
/// 占位符替换/深拷贝/输入校验/成功判定/超时取消语义全部收敛于此。
/// 绝不修改命令库源数据（深拷贝防污染）；失败返回结构化结果，不抛异常。
/// </summary>
public class ExecutionService
{
    private readonly IAdbProcessService _adb;
    private readonly ILogService _log;
    private readonly string _moduleId;

    public ExecutionService(IAdbProcessService adb, ILogService log, string moduleId)
    {
        _adb = adb;
        _log = log;
        _moduleId = moduleId;
    }

    /// <summary>执行单条命令</summary>
    public async Task<CommandResult> ExecuteAsync(
        string serial, CommandDefinition cmd, string[]? inputs, CancellationToken ct = default)
    {
        // ===== 输入校验（结构化失败，不抛异常） =====
        if (cmd.RequiresInput && inputs is not { Length: > 0 })
            return Fail(cmd, serial, ResultSource.InvalidInput, "缺少输入参数");
        if (inputs is { Length: > 0 } && inputs.Length != cmd.InputPrompts.Count)
            return Fail(cmd, serial, ResultSource.InvalidInput,
                $"输入参数数量不匹配: 需要 {cmd.InputPrompts.Count} 个，实际 {inputs.Length} 个");

        // ===== 占位符替换 =====
        var resolved = ResolvePlaceholders(cmd.Command, inputs);
        if (ContainsUnresolvedPlaceholder(resolved))
            _log.Warn($"命令 \"{cmd.Name}\" 含未替换占位符: {resolved}", _moduleId);

        return await RunWithResultAsync(cmd, serial, resolved, ct);
    }

    /// <summary>执行命令组（步骤级进度回调；onStep 在后台线程调用，调用方负责线程安全）</summary>
    public async Task<GroupResult> ExecuteGroupAsync(
        string serial, CommandGroup group, string[]? inputs,
        Action<int, CommandResult, bool>? onStep = null, CancellationToken ct = default)
    {
        // 输入校验：需输入步骤的提示总数
        var promptCount = group.Steps.Where(s => s.RequiresInput).Sum(s => s.InputPrompts.Count);
        if (promptCount > 0 && inputs is not { Length: > 0 })
        {
            return new GroupResult
            {
                Results = [Fail(group.Steps.First(s => s.RequiresInput), serial, ResultSource.InvalidInput, "缺少输入参数")],
                Aborted = true, AbortedStepIndex = 1
            };
        }
        if (inputs is { Length: > 0 } && inputs.Length != promptCount)
        {
            return new GroupResult
            {
                Results = [Fail(group.Steps.First(s => s.RequiresInput), serial, ResultSource.InvalidInput,
                    $"输入参数数量不匹配: 需要 {promptCount} 个，实际 {inputs.Length} 个")],
                Aborted = true, AbortedStepIndex = 1
            };
        }

        // 深拷贝命令组 + 按步骤分配输入值（绝不修改库源数据）
        var valueQueue = inputs is { Length: > 0 } ? new Queue<string>(inputs) : null;
        var executionGroup = CloneGroup(group);
        var result = new GroupResult();
        var stepIndex = 0;

        foreach (var step in executionGroup.Steps)
        {
            ct.ThrowIfCancellationRequested();
            stepIndex++;

            // 需要输入的步骤：取对应数量的输入值替换占位符
            if (step.RequiresInput && valueQueue is not null)
            {
                var values = new string[step.InputPrompts.Count];
                for (var i = 0; i < values.Length; i++)
                    values[i] = valueQueue.Dequeue(); // 数量已在上方校验，不会空队列
                step.Command = ResolvePlaceholders(step.Command, values);
                step.InputPrompts = [];
            }

            var stepResult = await RunWithResultAsync(step, serial, step.Command, ct);
            result.Results.Add(stepResult);

            var willAbort = !stepResult.Success && step.StopOnFail;
            onStep?.Invoke(stepIndex, stepResult, willAbort);

            if (willAbort)
            {
                result.Aborted = true;
                result.AbortedStepIndex = stepIndex;
                return result;
            }

            if (step.DelayAfterMs > 0)
            {
                try { await Task.Delay(step.DelayAfterMs, ct); }
                catch (TaskCanceledException) { break; }
            }
        }

        return result;
    }

    // ==================== 内部 ====================

    private async Task<CommandResult> RunWithResultAsync(
        CommandDefinition cmd, string serial, string resolved, CancellationToken ct)
    {
        var result = new CommandResult
        {
            Command = $"adb {resolved}",
            CommandName = cmd.Name,
            DeviceSerial = serial,
            Timestamp = DateTime.Now
        };

        try
        {
            var raw = await _adb.RunAsync(serial, resolved, cmd.TimeoutMs, ct);
            result.Output = raw.Output;
            result.Error = raw.Error;
            result.ElapsedMs = raw.ElapsedMs;
            result.Success = CommandEvaluator.Evaluate(raw.Output, raw.ExitCode, cmd.SuccessRegex, cmd.FailureRegex);
            result.Source = result.Success
                ? (raw.ExitCode == 0 && string.IsNullOrEmpty(cmd.SuccessRegex) ? ResultSource.ExitCode : ResultSource.SuccessRegex)
                : ResultSource.FailureRegex;
        }
        catch (TimeoutException)
        {
            result.Success = false;
            result.Source = ResultSource.Timeout;
            result.Error = "执行超时";
        }
        catch (OperationCanceledException)
        {
            result.Success = false;
            result.Source = ResultSource.Canceled;
            result.Error = "已取消";
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Source = ResultSource.ProcessError;
            result.Error = ex.Message;
        }

        return result;
    }

    private static CommandResult Fail(CommandDefinition cmd, string serial, ResultSource source, string error)
        => new()
        {
            Command = cmd.DisplayCommand,
            CommandName = cmd.Name,
            DeviceSerial = serial,
            Success = false,
            Source = source,
            Error = error,
            Timestamp = DateTime.Now
        };

    /// <summary>
    /// 安全替换 {0} {1}... 占位符。
    /// 不用 string.Format：模板含非法花括号会抛异常；这里仅精确替换 {n}，非法花括号原样保留。
    /// </summary>
    private static string ResolvePlaceholders(string template, string[]? values)
    {
        if (values is not { Length: > 0 })
            return template;
        var result = template;
        for (var i = 0; i < values.Length; i++)
            result = result.Replace($"{{{i}}}", values[i]);
        return result;
    }

    private static bool ContainsUnresolvedPlaceholder(string command)
        => System.Text.RegularExpressions.Regex.IsMatch(command, @"\{\d+\}");

    /// <summary>深拷贝命令组（仅本次执行使用，绝不修改库源数据）</summary>
    private static CommandGroup CloneGroup(CommandGroup group)
        => new()
        {
            Id = group.Id,
            Name = group.Name,
            Category = group.Category,
            Description = group.Description,
            Steps = new System.Collections.ObjectModel.ObservableCollection<CommandDefinition>(
                group.Steps.Select(s => new CommandDefinition
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
                }))
        };
}
