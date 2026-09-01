# Yohu ADB Tools v6 — 发布构建（NSIS 安装包）
# 用法（真机）：
#   powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1
# 前置：
#   1. cargo install tauri-cli --locked（原生 CLI）
#   2. tools/ 下存在 sidecar adb 与 scrcpy-server（scripts/setup-adb.ps1 / setup-scrcpy-server.ps1）
#   3. 若网络无法访问 github releases（NSIS 工具链下载超时）：
#      winget install --id NSIS.NSIS -e 后，
#      把安装目录复制到 %LOCALAPPDATA%\tauri\nsis-3.11
# 产物：target\release\bundle\nsis\YohuAdbTools_<版本>_x64-setup.exe

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $repoRoot "app\yohu-adbtools"

# sidecar 资源前置校验（adb 三件套 + scrcpy-server 均为 .gitignore 忽略项）。
foreach ($rel in @("tools\adb.exe", "tools\AdbWinApi.dll", "tools\AdbWinUsbApi.dll", "tools\scrcpy-server")) {
  if (-not (Test-Path (Join-Path $repoRoot $rel))) {
    throw "缺少 sidecar 资源 $rel，请先运行 scripts\setup-adb.ps1 与 scripts\setup-scrcpy-server.ps1"
  }
}

# 原生命令不会因非零退出抛错（$ErrorActionPreference 只对 cmdlet 生效）；必须显式检查。
function Native([string]$cmdline) {
  Invoke-Expression $cmdline
  if ($LASTEXITCODE -ne 0) {
    throw "命令失败（退出码 $LASTEXITCODE）：$cmdline"
  }
}

# 打包前记录 nsis 目录时间戳，防止失败后误取上一版本残留安装包。
$nsisDir = Join-Path $repoRoot "target\release\bundle\nsis"
$baseline = if (Test-Path $nsisDir) { (Get-ChildItem $nsisDir -Filter "*setup.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime } else { [datetime]::MinValue }

Write-Host "[1/3] 前端构建…"
Set-Location (Join-Path $repoRoot "ui")
Native "pnpm install --frozen-lockfile"
Native "pnpm exec tsc -b"
Native "pnpm test"
Native "pnpm lint"
Native "pnpm build"

Write-Host "[2/3] Rust 校验…"
Set-Location $repoRoot
Native "cargo clippy --workspace --all-targets -- -D warnings"
Native "cargo build --workspace"
Native "cargo test --workspace"

Write-Host "[3/3] Tauri 打包（NSIS + WebView2 embedBootstrapper）…"
Set-Location $appDir
Native "cargo tauri build"

$setup = Get-ChildItem $nsisDir -Filter "*setup.exe" -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -gt $baseline } |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) { throw "未找到本次构建的安装包产物（可能打包失败或产物未更新）" }
$mb = [math]::Round($setup.Length / 1MB, 2)
Write-Host ""
Write-Host "安装包：$($setup.FullName)（$mb MB）"
Write-Host "v6 发布构建完成"
Write-Host "挂到 GitHub Release：打标签 vX.Y.Z 推送（.github/workflows/release.yml），或 scripts\publish-github-release.ps1 -Tag vX.Y.Z"
