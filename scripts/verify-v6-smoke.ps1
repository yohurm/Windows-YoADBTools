# Yohu ADB Tools v6 — 冒烟回归（S1）
# 用法（应用需关闭，真机桌面会话运行）：
#   powershell -ExecutionPolicy Bypass -File scripts/verify-v6-smoke.ps1
# 覆盖：启动存活 / 无 panic 日志 / 数据目录创建（adb 解压 + 设置）

param(
    [string]$Exe = (Join-Path $PSScriptRoot "..\target\release\YohuAdbTools.exe")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Exe)) {
    throw "未找到 $Exe — 请先执行 cargo tauri build --no-bundle（在 app/yohu-app 下）"
}

# 共享库：数据目录名（= PRODUCT_NAME / DATA_DIR_NAME）单源
. (Join-Path $PSScriptRoot "verify-lib.ps1")

$dataRoot = Join-Path $env:LOCALAPPDATA $ProductDataDir
$logsDir = Join-Path $dataRoot "logs"
Remove-Item (Join-Path $logsDir "panic-*.log") -ErrorAction SilentlyContinue

Write-Host "[1/4] 启动应用…"
$p = Start-Process -FilePath $Exe -PassThru
Start-Sleep -Seconds 8

Write-Host "[2/4] 检查进程存活…"
if (-not $p -or $p.HasExited) {
    throw "应用启动失败或提前退出 code=$($p.ExitCode)"
}
Write-Host "  OK：进程存活 (pid=$($p.Id))"

Write-Host "[3/4] 检查崩溃日志…"
$panics = @(Get-ChildItem $logsDir -Filter "panic-*.log" -ErrorAction SilentlyContinue)
if ($panics.Count -gt 0) {
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    throw "发现 panic 日志: $($panics.Name -join ', ')"
}
Write-Host "  OK：无 panic 日志"

Write-Host "[4/4] 检查启动管线产物（sidecar 解压 + 默认命令库）…"
Start-Sleep -Seconds 3
$adbExe = Join-Path $dataRoot "data\tools\adb\adb.exe"
$library = Join-Path $dataRoot "data\modules\adb-terminal\config\library.json"
if (-not (Test-Path $adbExe)) {
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    throw "sidecar adb 未解压: $adbExe"
}
if (-not (Test-Path $library)) {
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    throw "默认命令库未写入: $library"
}
Write-Host "  OK：adb 解压 + 命令库就绪"

Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "v6 冒烟通过 （进程存活 8s，无 panic，启动管线产物就绪）"
