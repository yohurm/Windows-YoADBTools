# Yovo ADB Tools v6 — 日志性能验收（需设备在线；真机桌面会话运行）
# 用法（应用需关闭）：
#   powershell -ExecutionPolicy Bypass -File scripts/verify-v6-logs-perf.ps1
# 目标（架构文档 §12）：50k 缓冲 + 3 会话 + 每会话 2000 可见行，UI 交互不掉帧。

param(
    [string]$Exe = (Join-Path $PSScriptRoot "..\target\release\yovo-app.exe")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Exe)) {
    throw "未找到 $Exe — 请先 cargo build --release -p yovo-app"
}

Write-Host "== Yovo ADB Tools v6 日志性能验收 =="
Write-Host "前置：设备已连接授权；设置中 buffer.capacity=50000、display.limit=2000（默认值）。"
Write-Host ""

$p = Start-Process -FilePath $Exe -PassThru
Start-Sleep -Seconds 6

$checks = @(
    @{ Name = "持续采集 60s"; Hint = "日志分析 → 开始采集，保持 60 秒（设备需有日志输出；无输出可 adb shell 执行循环 log 制造流量）" },
    @{ Name = "3 会话并行"; Hint = "Ctrl+T 创建 3 个会话（全部/按包名/按 PID）；3 个 Tab 切换流畅" },
    @{ Name = "过滤即时重放"; Hint = "修改级别/Tag/关键字 → 可见列表 200ms 内重建且滚动不卡" },
    @{ Name = "缓冲回补"; Hint = "采集 ≥1 分钟后新建会话 → 新会话立即重放出历史缓冲" },
    @{ Name = "滚动流畅"; Hint = "滚底/暂停/继续：列表滚动无卡顿、无白屏；自动滚底稳定" },
    @{ Name = "内存约束"; Hint = "任务管理器确认 yovo-app.exe 内存 < 800MB（50k 缓冲预期 < 300MB）" },
    @{ Name = "无崩溃"; Hint = "全程无卡死；停止后应用仍可交互" }
)

$failures = @()
foreach ($check in $checks) {
    $answer = Read-Host "检查「$($check.Name)」：$($check.Hint) [y/N]"
    if ($answer -notmatch '^y') { $failures += $check.Name }
}

Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
$logsDir = Join-Path $env:LOCALAPPDATA "YovoAdbTools\logs"
$panics = @(Get-ChildItem $logsDir -Filter "panic-*.log" -ErrorAction SilentlyContinue)

if ($failures.Count -eq 0 -and $panics.Count -eq 0) {
    Write-Host "v6 日志性能验收通过 ✅"
} else {
    if ($failures.Count -gt 0) { Write-Host "未通过：$($failures -join '、')" }
    if ($panics.Count -gt 0) { Write-Host "crash：$($panics.Name -join '、')" }
    exit 1
}
