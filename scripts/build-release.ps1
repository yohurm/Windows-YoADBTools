# Yohu ADB Tools v6 — 发布构建（NSIS 安装包 ≤ 12 MB）
# 用法（真机）：
#   powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1
# 前置：
#   1. cargo install tauri-cli --locked（原生 CLI）
#   2. tools/ 下存在 sidecar adb（scripts/setup-adb.ps1）
#   3. 若网络无法访问 github releases（NSIS 工具链下载超时）：
#      winget install --id NSIS.NSIS -e 后，
#      把安装目录复制到 %LOCALAPPDATA%\tauri\nsis-3.11
# 产物：target\release\bundle\nsis\YohuAdbTools_<版本>_x64-setup.exe

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $repoRoot "app\yohu-app"

Write-Host "[1/3] 前端构建…"
Set-Location (Join-Path $repoRoot "ui")
pnpm install --frozen-lockfile
pnpm exec tsc -b
pnpm test
pnpm build

Write-Host "[2/3] Rust 校验…"
Set-Location $repoRoot
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
cargo test --workspace

Write-Host "[3/3] Tauri 打包（NSIS + WebView2 embedBootstrapper）…"
Set-Location $appDir
cargo tauri build

$setup = Get-ChildItem (Join-Path $repoRoot "target\release\bundle\nsis") -Filter "*setup.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) { throw "未找到安装包产物" }
$mb = [math]::Round($setup.Length / 1MB, 2)
Write-Host ""
Write-Host "安装包：$($setup.FullName)（$mb MB）"
if ($mb -gt 12) { throw "超过 12 MB 预算！" }
Write-Host "v6 发布构建完成 "
