# Yohu ADB Tools v6 — sidecar scrcpy-server 准备
# tools/scrcpy-server 被 .gitignore 排除（官方二进制不入库）。
# 本脚本从 Genymobile/scrcpy v4.1 Release 下载官方 server（与协议钉死版本一致）。
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts/setup-scrcpy-server.ps1

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $repoRoot "tools"
$target = Join-Path $targetDir "scrcpy-server"
$version = "4.1"
$url = "https://github.com/Genymobile/scrcpy/releases/download/v$version/scrcpy-server-v$version"

New-Item -ItemType Directory -Force $targetDir | Out-Null

if (Test-Path $target) {
    $len = (Get-Item $target).Length
    if ($len -gt 100000) {
        Write-Host "scrcpy-server 已存在（$len 字节），跳过下载"
        exit 0
    }
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("yohu-scrcpy-server-" + [guid]::NewGuid().ToString("N"))
try {
    Write-Host "下载 scrcpy-server v$version：$url"
    Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
    Copy-Item -LiteralPath $tmp -Destination $target -Force
    Write-Host "OK：$target"
}
finally {
    if (Test-Path $tmp) { Remove-Item -LiteralPath $tmp -Force }
}

Write-Host "sidecar scrcpy-server 就绪（版本 $version）"
