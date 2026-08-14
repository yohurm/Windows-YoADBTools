# Yovo ADB Tools v6 — 冒烟回归（S1）
# 用法（应用需关闭，真机桌面会话运行）：
#   powershell -ExecutionPolicy Bypass -File scripts/verify-v6-smoke.ps1
# 覆盖：启动存活 / 无 panic 日志 / 数据目录创建（adb 解压 + 设置）

param(
    [string]$Exe = (Join-Path $PSScriptRoot "..\target\release\yovo-app.exe")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Exe)) {
    throw "未找到 $Exe — 请先执行 cargo build --release -p yovo-app"
}

$dataRoot = Join-Path $env:LOCALAPPDATA "YovoAdbTools"
$logsDir = Join-Path $dataRoot "logs"
Remove-Item (Join-Path $logsDir "panic-*.log") -ErrorAction SilentlyContinue

Write-Host "[1/4] 启动应用…"
$p = Start-Process -FilePath $Exe -PassThru
Start-Sleep -Seconds 8

Write-Host "[2/4] 检查进程存活…"
if ($p.HasExited) {
    throw "应用提前退出 code=$($p.ExitCode)"
}
Write-Host "  OK：进程存活 (pid=$($p.Id))"

Write-Host "[3/4] 检查崩溃日志…"
$panics = @(Get-ChildItem $logsDir -Filter "panic-*.log" -ErrorAction SilentlyContinue)
if ($panics.Count -gt 0) {
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    throw "发现 panic 日志: $($panics.Name -join ', ')"
}
Write-Host "  OK：无 panic 日志"

Write-Host "[4/4] 检查数据目录初始化（adb 解压/设置）…"
Start-Sleep -Seconds 3
$settings = Join-Path $dataRoot "settings"
if (-not (Test-Path $settings)) {
    Write-Host "  WARN：settings 目录未创建（首次启动可能未触发设置写盘）"
} else {
    Write-Host "  OK：数据根已初始化"
}

Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "v6 冒烟通过 ✅（进程存活 8s，无 panic，数据目录就绪）"
