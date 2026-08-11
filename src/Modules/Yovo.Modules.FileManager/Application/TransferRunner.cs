using System.IO;
using Yovo.Modules.FileManager.Domain;
using Yovo.Platform.Abstractions.Adb;
using Yovo.Platform.Abstractions.Devices;
using Yovo.Platform.Abstractions.Tasks;

namespace Yovo.Modules.FileManager.Application;

/// <summary>
/// 传输运行器 — 单次 push/pull + 后台任务登记 + 进度回写。
/// 结束状态（成功/失败/取消）由调用方呈现；本类只负责登记与清理。
/// </summary>
public class TransferRunner(IAdbTransfer transfer, IBackgroundTaskCenter tasks)
{
    public async Task RunAsync(DeviceSerial serial, TransferDirection direction,
        string localPath, RemotePath remotePath,
        IProgress<TransferProgress>? uiProgress = null, CancellationToken ct = default)
    {
        var label = direction == TransferDirection.Push ? "上传" : "下载";
        var id = tasks.Register(new BackgroundTaskDescriptor(
            label, FileManagerModule.ModuleId,
            Detail: $"{Path.GetFileName(localPath)} → {remotePath.Value}"));

        // 进度双写：后台任务中心（状态栏）+ 调用方 UI 进度（进度条）
        var progress = new Progress<TransferProgress>(p =>
        {
            var percent = p.Percent ?? (p.TransferredBytes > 0 ? 0d : (double?)null);
            tasks.Update(id, BackgroundTaskState.Running, progressPercent: percent);
            uiProgress?.Report(p);
        });

        try
        {
            if (direction == TransferDirection.Push)
                await transfer.PushAsync(serial, localPath, remotePath.Value, progress, ct);
            else
                await transfer.PullAsync(serial, remotePath.Value, localPath, progress, ct);

            tasks.Complete(id, BackgroundTaskCompletion.Success);
        }
        catch (OperationCanceledException)
        {
            tasks.Complete(id, BackgroundTaskCompletion.Canceled);
            throw;
        }
        catch
        {
            tasks.Complete(id, BackgroundTaskCompletion.Failed);
            throw;
        }
    }
}

/// <summary>传输方向</summary>
public enum TransferDirection
{
    Push,
    Pull,
}
