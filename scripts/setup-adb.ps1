# Yovo ADB Tools v6 — sidecar adb 准备
# tools/ 下官方 adb 三件套被 .gitignore 排除（二进制不入库）。
# 本脚本从 Google platform-tools 下载并解出 adb.exe / AdbWinApi.dll / AdbWinUsbApi.dll。
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts/setup-adb.ps1
# 后续：构建/打包时 tauri.conf.json 的 bundle.resources 会引用 tools/ 下文件。

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $repoRoot "tools"
$files = @("adb.exe", "AdbWinApi.dll", "AdbWinUsbApi.dll")
# 钉死版本，避免 latest 漂移；36.0.2 含 Windows pull/push 截断修复
$platformToolsUrl = "https://dl.google.com/android/repository/platform-tools_r36.0.2-win.zip"

New-Item -ItemType Directory -Force $targetDir | Out-Null

$missing = @($files | Where-Object { -not (Test-Path (Join-Path $targetDir $_)) })
if ($missing.Count -eq 0) {
    Write-Host "sidecar adb 已存在，跳过下载"
    exit 0
}

$tmpZip = Join-Path ([System.IO.Path]::GetTempPath()) ("yovo-platform-tools-" + [guid]::NewGuid().ToString("N") + ".zip")
$tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ("yovo-platform-tools-" + [guid]::NewGuid().ToString("N"))
try {
    Write-Host "下载 platform-tools：$platformToolsUrl"
    Invoke-WebRequest -Uri $platformToolsUrl -OutFile $tmpZip -UseBasicParsing
    Expand-Archive -LiteralPath $tmpZip -DestinationPath $tmpDir -Force
    $srcDir = Join-Path $tmpDir "platform-tools"
    foreach ($name in $files) {
        $src = Join-Path $srcDir $name
        if (-not (Test-Path $src)) {
            throw "zip 中缺少 $name"
        }
        $dst = Join-Path $targetDir $name
        Copy-Item -LiteralPath $src -Destination $dst -Force
        Write-Host "OK：$dst"
    }
}
finally {
    if (Test-Path $tmpZip) { Remove-Item -LiteralPath $tmpZip -Force }
    if (Test-Path $tmpDir) { Remove-Item -LiteralPath $tmpDir -Recurse -Force }
}

Write-Host ""
Write-Host "sidecar adb 就绪（$($files.Count) 个文件）"
