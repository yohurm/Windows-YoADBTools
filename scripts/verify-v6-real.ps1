# Yohu ADB Tools v6 — 真机端到端联调（Windows UIA 驱动 WebView2 + 真实 adb 设备）
# 用法（应用需关闭；必须 cargo tauri build --no-bundle，不要用裸 cargo build --release）：
#   $env:CARGO_TARGET_DIR = "E:\GithubGallery\Windows-YoADBTools\target"
#   powershell -ExecutionPolicy Bypass -File scripts/verify-v6-real.ps1
# 覆盖：设备扫描 / 设置页 / 终端（库/命令管理取消/执行/组/占位符）/
#       文件（浏览/新建目录/删除）/ 日志（采集/关键字过滤）/ 投屏占位。
# 原理：SPI_SETSCREENREADER 强制激活 WebView2 无障碍树 → UIA 枚举 DOM 元素并按名交互。
# UIA 助手与 settings 生成来自共享库（scripts/uia.ps1 + scripts/verify-lib.ps1），本文件不再内联。

param(
    [string]$Exe = (Join-Path $PSScriptRoot "..\target\release\YohuAdbTools.exe")
)

$ErrorActionPreference = "Stop"
$Exe = [System.IO.Path]::GetFullPath($Exe)
if (-not (Test-Path $Exe)) { throw "未找到 $Exe（先 cargo tauri build --no-bundle）" }

# 共享库：UIA 助手（uia.ps1）+ 数据目录常量 / settings.json 生成（verify-lib.ps1）
. (Join-Path $PSScriptRoot "uia.ps1")
. (Join-Path $PSScriptRoot "verify-lib.ps1")

function Invoke-Adb([string[]]$adbArgs) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $out = & $script:adb @adbArgs 2>&1 | ForEach-Object { "$_" }
        return @{ ExitCode = $LASTEXITCODE; Text = ($out -join "`n") }
    } finally {
        $ErrorActionPreference = $prev
    }
}

# ===== 1. 确认真机在线；恢复自动解析 adb（不要指向 fake-adb） =====
$adbCandidates = @(
    (Join-Path $PSScriptRoot "..\tools\adb.exe"),
    (Join-Path (Join-Path $env:LOCALAPPDATA $ProductDataDir) "data\tools\adb\adb.exe")
)
$adb = $adbCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $adb) { $adb = "adb" }
$script:adb = $adb
$devOut = & $adb devices -l 2>&1 | Out-String
if ($devOut -notmatch "\sdevice\s") { throw "no online device. adb devices:`n$devOut" }
Write-Host "device online"

# 用共享单源写 settings.json（adb_path 留空 = 自动解析真实 adb）。
Write-AppSettings -AdbPath ""

$e2eDir = "000-yohu-e2e"
[void](Invoke-Adb @("shell", "rm", "-rf", "/sdcard/$e2eDir"))

Get-Process -Name "YohuAdbTools" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

# ===== 2. 启动应用 + 激活无障碍树 =====
Set-ReaderFlag $true
$app = Start-Process -FilePath $Exe -PassThru
$appRoot = Wait-AppRoot $app.Id
Start-Sleep -Seconds 12

try {
    $refreshBtn = Find-Button $appRoot "刷新设备" 8
    if ($refreshBtn) { Invoke-Click $refreshBtn; Start-Sleep -Seconds 2 }
    # 机型动态化（M3）：从 adb devices -l 解析在线设备型号，按型号/其词元定位设备栏。
    $onlineModel = $null
    foreach ($line in ($devOut -split "`r?`n")) {
        if ($line -match "device\s+product:\S+\s+model:([^ ]+)") { $onlineModel = $Matches[1]; break }
    }
    $deviceHit = $null
    if ($onlineModel) {
        foreach ($part in @($onlineModel) + (@($onlineModel -split '[_\s]+') | Where-Object { $_.Length -ge 3 })) {
            $deviceHit = Find-ByName $appRoot $part $true 4
            if ($deviceHit) { break }
        }
    }
    if (-not $deviceHit) { $deviceHit = Find-ByName $appRoot "在线" $true 4 }
    Assert "device rail shows real device" ($null -ne $deviceHit)

    $navSettings = Find-Button $appRoot "设置" 8
    if ($navSettings) { Invoke-Click $navSettings; Start-Sleep -Seconds 1 }
    $settingsTitle = Find-ByName $appRoot "立即生效" $true 6
    if (-not $settingsTitle) { $settingsTitle = Find-ByName $appRoot "工具链" $true 3 }
    Assert "settings page shows effect badges" ($null -ne $settingsTitle)
    $adbPathField = Find-ByName $appRoot "ADB 路径" $true 4
    Assert "settings ADB path field reachable" ($null -ne $adbPathField)

    $navTerminal = Find-Button $appRoot "ADB 命令终端" 10
    if ($navTerminal) { Invoke-Click $navTerminal; Start-Sleep -Seconds 1 }
    $treeCmd = Find-ByName $appRoot "型号" $true 10
    Assert "command tree has model" ($null -ne $treeCmd)

    $mgrBtn = Find-Button $appRoot "命令管理" 8
    Assert "command manager button exists" ($null -ne $mgrBtn)
    if ($mgrBtn) { Invoke-Click $mgrBtn; Start-Sleep -Seconds 1 }
    $mgrOpen = Find-ByName $appRoot "新增组" $true 6
    Assert "command manager dialog opens" ($null -ne $mgrOpen)
    Assert "command manager cancel" (Invoke-DialogButton $appRoot "命令管理" "取消")
    Start-Sleep -Milliseconds 600
    $mgrGone = Find-ByName $appRoot "新增组" $true 2
    Assert "command manager cancel leaves library" ($null -eq $mgrGone)
    $treeAfter = Find-ByName $appRoot "型号" $true 6
    Assert "library intact after manager cancel" ($null -ne $treeAfter)

    if ($treeAfter) { Invoke-Click $treeAfter; Start-Sleep -Milliseconds 800 }
    $runBtn = Find-Button $appRoot "执行" 8
    Assert "run button exists" ($null -ne $runBtn)
    if ($runBtn) { Invoke-Click $runBtn; Start-Sleep -Seconds 5 }
    $passed = Find-AllByName $appRoot "通过"
    if ($passed.Count -lt 1) { $passed = Find-AllByName $appRoot "motorola" $true }
    Assert "terminal model command passed" ($passed.Count -ge 1)

    $group = Find-ByName $appRoot "设备信息" $true 8
    if ($group) { Invoke-Click $group; Start-Sleep -Milliseconds 400 }
    $runBtn2 = Find-Button $appRoot "执行" 6
    if ($runBtn2) { Invoke-Click $runBtn2; Start-Sleep -Seconds 7 }
    $passed2 = Find-AllByName $appRoot "通过"
    Assert "terminal device-info group passed" ($passed2.Count -ge 1)

    $propsCmd = Find-ByName $appRoot "查询属性" $true 8
    Assert "props command in tree" ($null -ne $propsCmd)
    if ($propsCmd) { Invoke-Click $propsCmd; Start-Sleep -Milliseconds 500 }
    $runBtn3 = Find-Button $appRoot "执行" 6
    if ($runBtn3) { Invoke-Click $runBtn3; Start-Sleep -Seconds 1 }
    $propField = Find-Edit $appRoot "属性名" $true 6
    Assert "props input dialog shown" ($null -ne $propField)
    if ($propField) { Set-Value $propField "ro.product.model" }
    Assert "props dialog execute" (Invoke-DialogButton $appRoot "执行: 查询属性" "执行")
    Start-Sleep -Seconds 5
    $passed3 = Find-AllByName $appRoot "通过"
    Assert "terminal getprop passed" ($passed3.Count -ge 1)

    $navFiles = Find-Button $appRoot "文件管理" 10
    if ($navFiles) { Invoke-Click $navFiles; Start-Sleep -Seconds 3 }
    $dcim = Find-ByName $appRoot "DCIM" $true 12
    if (-not $dcim) { $dcim = Find-ByName $appRoot "Android" $true 4 }
    if (-not $dcim) { $dcim = Find-ByName $appRoot "Download" $true 4 }
    Assert "file list shows storage dir" ($null -ne $dcim)

    $mkdirField = Find-Edit $appRoot "新目录名" $false 6
    Assert "mkdir field exists" ($null -ne $mkdirField)
    if ($mkdirField) { Set-Value $mkdirField $e2eDir }
    $mkdirBtn = Find-Button $appRoot "新建目录" 6
    if ($mkdirBtn) { Invoke-Click $mkdirBtn; Start-Sleep -Seconds 3 }
    $created = Find-ByName $appRoot $e2eDir $false 8
    Assert "mkdir shows new directory" ($null -ne $created)
    $lsOut = Invoke-Adb @("shell", "ls", "/sdcard/$e2eDir")
    Assert "mkdir visible to adb" ($lsOut.ExitCode -eq 0 -and $lsOut.Text -notmatch "No such file")

    $delBtn = Find-Button $appRoot "删除 $e2eDir" 6
    Assert "dir delete button exists" ($null -ne $delBtn)
    if ($delBtn) { Invoke-Click $delBtn; Start-Sleep -Milliseconds 500 }
    Assert "delete confirm dialog" ($null -ne (Find-ByName $appRoot "确认删除" $true 4))
    $confirmDel = Find-Button $appRoot "删除" 4
    if ($confirmDel) { Invoke-Click $confirmDel; Start-Sleep -Seconds 3 }
    $gone = Find-ByName $appRoot $e2eDir $false 2
    Assert "deleted directory removed from list" ($null -eq $gone)
    $lsGone = Invoke-Adb @("shell", "ls", "/sdcard/$e2eDir")
    Assert "deleted directory gone on device" ($lsGone.Text -match "No such file" -or $lsGone.ExitCode -ne 0)

    $navLogs = Find-Button $appRoot "日志分析" 10
    if ($navLogs) { Invoke-Click $navLogs; Start-Sleep -Seconds 2 }
    $startBtn = Find-ByName $appRoot "开始" $false 10
    Assert "start capture button exists" ($null -ne $startBtn)
    if ($startBtn) { Invoke-Click $startBtn; Start-Sleep -Seconds 6 }
    $capturing = Find-ByName $appRoot "采集中" $true 8
    Assert "log capture running" ($null -ne $capturing)

    $kw = Find-Edit $appRoot "关键字" $false 6
    Assert "keyword filter field exists" ($null -ne $kw)
    if ($kw) {
        Set-Value $kw "zzznomatchyohu999"
        Start-Sleep -Seconds 2
    }
    $noHit = Find-ByName $appRoot "无匹配日志" $true 6
    Assert "keyword filter shows empty state" ($null -ne $noHit)
    $clearKw = Find-Button $appRoot "clear" 4
    if ($clearKw) { Invoke-Click $clearKw; Start-Sleep -Seconds 1 }

    $stopBtn = Find-ByName $appRoot "停止" $false 6
    if ($stopBtn) { Invoke-Click $stopBtn; Start-Sleep -Seconds 1 }
    $stopped = Find-ByName $appRoot "已停止" $true 6
    Assert "log capture stopped and buffer kept" ($null -ne $stopped)

    $navMirror = Find-Button $appRoot "投屏显示" 8
    if (-not $navMirror) {
        $all = Find-AllByName $appRoot "投屏显示" $true
        foreach ($e in $all) {
            if ($e.Current.ControlType.ProgrammaticName -eq "ControlType.Button") { $navMirror = $e; break }
        }
    }
    if ($navMirror) { Invoke-Click $navMirror; Start-Sleep -Seconds 1 }
    $planned = Find-ByName $appRoot "模块开发中" $true 6
    if (-not $planned) { $planned = Find-ByName $appRoot "开发中" $true 4 }
    Assert "mirror placeholder shown" ($null -ne $planned)
    $settingsLeak = Find-ByName $appRoot "立即生效" $true 2
    Assert "mirror is not settings page" ($null -eq $settingsLeak)
}
finally {
    Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue
    Set-ReaderFlag $false
    [void](Invoke-Adb @("shell", "rm", "-rf", "/sdcard/$e2eDir"))
}

Write-Host ""
Write-Host "real-device e2e: $checks checks, failed $($fails.Count)"
if ($fails.Count -gt 0) {
    Write-Host "failed: $($fails -join ', ')"
    exit 1
}
Write-Host "v6 real-device e2e all green"
