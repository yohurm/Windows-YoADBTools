# Yohu ADB Tools v6 — 发布构建
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1
# 前置：
#   1. tools/ 下存在 sidecar adb（scripts/setup-adb.ps1）
# 产物：target\release\YohuAdbTools.exe（当前为裸 Rust 壳，打包器后续随 rust-slint 接入）

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $repoRoot "app\yohu-app"

Write-Host "[1/2] Rust 校验…"
Set-Location $repoRoot
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
cargo test --workspace

Write-Host "[2/2] Release 构建…"
Set-Location $appDir
cargo build --release

$exe = Join-Path $repoRoot "target\release\YohuAdbTools.exe"
if (-not (Test-Path $exe)) { throw "未找到构建产物" }
$mb = [math]::Round((Get-Item $exe).Length / 1MB, 2)
Write-Host ""
Write-Host "可执行文件：$exe（$mb MB）"
Write-Host "v6 发布构建完成"
