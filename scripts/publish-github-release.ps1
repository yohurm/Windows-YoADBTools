# 把已有 NSIS 安装包挂到 GitHub Release（本机上传，CI 请走 .github/workflows/release.yml）。
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts/publish-github-release.ps1 -Tag v0.1.1
# 前置：
#   1. gh auth login（Fine-grained PAT：仅本仓 Contents Read and write）
#   2. 已有 target\release\bundle\nsis\*setup.exe（scripts\build-release.ps1）
# 公开仓库的应用内检查更新不需要 token，不要把 PAT 写进安装包或 update.json。

param(
  [Parameter(Mandatory = $true)]
  [string]$Tag,
  [string]$Notes = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$nsisDir = Join-Path $repoRoot "target\release\bundle\nsis"

if ($Tag -notmatch '^v\d+\.\d+\.\d+$') {
  throw "Tag 必须是 vX.Y.Z，例如 v0.1.1"
}

$setup = Get-ChildItem $nsisDir -Filter "*setup.exe" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $setup) {
  throw "未找到安装包，请先运行 scripts\build-release.ps1"
}

Write-Host "上传 $($setup.Name) 到 $Tag …"
$ghArgs = @("release", "create", $Tag, $setup.FullName, "--title", $Tag)
if ($Notes) {
  $ghArgs += @("--notes", $Notes)
} else {
  $ghArgs += "--generate-notes"
}
& gh @ghArgs
if ($LASTEXITCODE -ne 0) {
  throw "gh release create 失败（退出码 $LASTEXITCODE）"
}
Write-Host "已发布 https://github.com/yohurm/Windows-YoADBTools/releases/tag/$Tag"
