# Yovo ADB Tools v6 — sidecar adb 准备
# tools/ 被 .gitignore 排除（二进制不入库）；本脚本从 v5 归档拷贝官方 adb 三件套。
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts/setup-adb.ps1
# 后续：构建/打包时 tauri.conf.json 的 bundle.resources 会引用 tools/ 下文件。

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $repoRoot "old\src\Yovo.Platform\Tools"
$targetDir = Join-Path $repoRoot "tools"

if (-not (Test-Path $sourceDir)) {
    throw "未找到归档源目录 $sourceDir"
}

New-Item -ItemType Directory -Force $targetDir | Out-Null

$files = @("adb.exe", "AdbWinApi.dll", "AdbWinUsbApi.dll")
foreach ($f in $files) {
    $src = Join-Path $sourceDir $f
    $dst = Join-Path $targetDir $f
    if (-not (Test-Path $src)) {
        throw "归档中缺少 $src"
    }
    Copy-Item $src $dst -Force
    Write-Host "OK：$($dst)"
}

Write-Host ""
Write-Host "sidecar adb 就绪（$($files.Count) 个文件）"
