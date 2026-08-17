# Yovo ADB Tools v6 — 无真机端到端联调（Windows UIA 驱动 WebView2 无障碍树 + fake-adb 模拟设备）
# 用法（应用需关闭；需先 cargo build --workspace 与 cargo tauri build --no-bundle）：
#   powershell -ExecutionPolicy Bypass -File scripts/verify-v6-e2e.ps1
# 覆盖：设备扫描（假设备在线）/ 终端（库加载/执行判定）/ 文件（浏览列表）/
#       日志（开始采集/行渲染/关键字过滤/信号徽章）。
# 原理：SPI_SETSCREENREADER 强制激活 WebView2 无障碍树 → UIA 枚举 DOM 元素并按名交互。

param(
    [string]$Exe = (Join-Path $PSScriptRoot "..\target\release\YovoAdbTools.exe")
)

$ErrorActionPreference = "Stop"
$Exe = [System.IO.Path]::GetFullPath($Exe)
if (-not (Test-Path $Exe)) { throw "未找到 $Exe（先 cargo build --release -p yovo-app）" }

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class SysParam {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, IntPtr pvParam, uint fWinIni);
}
"@

function Set-ReaderFlag([bool]$on) {
    [SysParam]::SystemParametersInfo(0x0046, [uint32]$(if ($on) { 1 } else { 0 }), [IntPtr]::Zero, 0) | Out-Null
}

function Wait-AppRoot([int]$procId, [int]$timeoutSec = 30) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        $root = [System.Windows.Automation.AutomationElement]::RootElement
        $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
        foreach ($e in $all) {
            if ($e.Current.ControlType.ProgrammaticName -eq "ControlType.Document" -and $e.Current.Name -eq "Yovo ADB Tools") {
                return $e
            }
        }
        Start-Sleep -Milliseconds 500
    }
    throw "WebView2 document not found"
}

function Find-Button($scope, [string]$name, [int]$timeoutSec = 10) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        $all = $scope.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
        foreach ($e in $all) {
            if ($e.Current.Name -eq $name -and $e.Current.ControlType.ProgrammaticName -eq "ControlType.Button") {
                return $e
            }
        }
        Start-Sleep -Milliseconds 350
    }
    return $null
}

function Find-Edit($scope, [string]$name, [bool]$contains = $false, [int]$timeoutSec = 8) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        $all = $scope.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
        foreach ($e in $all) {
            if ($e.Current.ControlType.ProgrammaticName -ne "ControlType.Edit") { continue }
            $n = $e.Current.Name
            if (-not $n) { continue }
            if ($contains -and $n.Contains($name)) { return $e }
            if (-not $contains -and $n -eq $name) { return $e }
        }
        Start-Sleep -Milliseconds 350
    }
    return $null
}

function Find-ByName($scope, [string]$name, [bool]$contains = $false, [int]$timeoutSec = 10) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        $all = $scope.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
        foreach ($e in $all) {
            $n = $e.Current.Name
            if (-not $n) { continue }
            if ($contains -and $n.Contains($name)) { return $e }
            if (-not $contains -and $n -eq $name) { return $e }
        }
        Start-Sleep -Milliseconds 400
    }
    return $null
}

function Find-AllByName($scope, [string]$name, [bool]$contains = $false) {
    $out = @()
    $all = $scope.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($e in $all) {
        $n = $e.Current.Name
        if ($n -and (($contains -and $n.Contains($name)) -or (-not $contains -and $n -eq $name))) { $out += $e }
    }
    return ,$out
}

function Invoke-Click($element) {
    $pattern = $null
    if ($element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
        $pattern.Invoke()
        return
    }
    if ($element.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$pattern)) {
        $pattern.Select()
        return
    }
    throw "元素不可点击: $($element.Current.Name)"
}

function Set-Value($element, [string]$text) {
    $pattern = $null
    if (-not $element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
        throw "元素不支持输入: $($element.Current.Name)"
    }
    $pattern.SetValue($text)
}

$checks = 0
$fails = @()
function Assert($name, [bool]$ok) {
    $script:checks++
    if ($ok) { Write-Host "  OK：$name" } else { Write-Host "  FAIL：$name"; $script:fails += $name }
}

function Restore-Settings {
    $settingsDir = Join-Path $env:LOCALAPPDATA "YovoAdbTools\settings"
    New-Item -ItemType Directory -Force $settingsDir | Out-Null
    @{ adb_path = ""; data_root = ""; devices_auto_refresh = 0; buffer_capacity = 50000; display_limit = 2000; clear_device_on_start = $false; theme = "light"; density = "compact" } |
        ConvertTo-Json | Set-Content (Join-Path $settingsDir "settings.json") -Encoding utf8
}

# ===== 1. 准备 fake 设备（独立目录 + 设置 adb.path） =====
$fakeDir = Join-Path $env:LOCALAPPDATA "YovoFakeDevice"
New-Item -ItemType Directory -Force $fakeDir | Out-Null
$fakeExe = Join-Path $fakeDir "fake-adb.exe"
$fakeBin = Join-Path $PSScriptRoot "..\target\debug\fake-adb.exe"
if (-not (Test-Path $fakeBin)) { throw "先执行 cargo build --workspace（fake-adb 明文 bin）" }
Copy-Item $fakeBin $fakeExe -Force
Copy-Item (Join-Path $PSScriptRoot "..\tools\fake-adb\device-profile.json") (Join-Path $fakeDir "fake-adb.json") -Force

$settingsDir = Join-Path $env:LOCALAPPDATA "YovoAdbTools\settings"
New-Item -ItemType Directory -Force $settingsDir | Out-Null
@{ adb_path = $fakeExe; data_root = ""; devices_auto_refresh = 0; buffer_capacity = 50000; display_limit = 2000; clear_device_on_start = $false; theme = "light"; density = "compact" } |
    ConvertTo-Json | Set-Content (Join-Path $settingsDir "settings.json") -Encoding utf8

# ===== 2. 启动应用 + 激活无障碍树 =====
Set-ReaderFlag $true
$app = Start-Process -FilePath $Exe -PassThru
$appRoot = Wait-AppRoot $app.Id
Start-Sleep -Seconds 12

try {
    # ===== 3. 设备栏：假设备在线 =====
    $model = Find-ByName $appRoot "Yovo Phone" $true 10
    Assert "设备栏出现假设备（Yovo Phone）" ($null -ne $model)

    # ===== 4. 终端：导航 → 树 → 执行「型号」→ 通过判定 =====
    $navTerminal = Find-Button $appRoot "ADB 命令终端" 10
    if (-not $navTerminal) { $navTerminal = Find-ByName $appRoot "ADB 命令终端" $false 4 }
    if ($navTerminal) { Invoke-Click $navTerminal; Start-Sleep -Seconds 1 }
    $treeCmd = Find-ByName $appRoot "型号" $true 10
    Assert "命令库树出现「型号」" ($null -ne $treeCmd)
    if ($treeCmd) { Invoke-Click $treeCmd; Start-Sleep -Milliseconds 500 }
    $runBtn = Find-ByName $appRoot "执行" $false 10
    Assert "执行按钮存在" ($null -ne $runBtn)
    if ($runBtn) { Invoke-Click $runBtn; Start-Sleep -Seconds 3 }
    $passed = Find-AllByName $appRoot "通过"
    Assert "终端执行出现「通过」判定" ($passed.Count -ge 1)

    # ===== 5. 文件：导航 → 列表出现 DCIM =====
    $navFiles = Find-Button $appRoot "文件管理" 10
    if (-not $navFiles) { $navFiles = Find-ByName $appRoot "文件管理" $false 4 }
    if ($navFiles) { Invoke-Click $navFiles; Start-Sleep -Seconds 2 }
    $dcim = Find-ByName $appRoot "DCIM" $true 10
    Assert "文件列表出现 DCIM" ($null -ne $dcim)

    # ===== 6. 日志：导航 → 开始采集 → 行渲染 → 关键字过滤 → 信号 =====
    $navLogs = Find-Button $appRoot "日志分析" 10
    if (-not $navLogs) { $navLogs = Find-ByName $appRoot "日志分析" $false 4 }
    if ($navLogs) { Invoke-Click $navLogs; Start-Sleep -Seconds 2 }
    $startBtn = Find-ByName $appRoot "开始" $false 10
    Assert "开始按钮存在" ($null -ne $startBtn)
    if ($startBtn) { Invoke-Click $startBtn; Start-Sleep -Seconds 5 }
    $logTag = Find-ByName $appRoot "TestTag" $true 8
    Assert "logcat 行渲染（TestTag 出现）" ($null -ne $logTag)

    # 关键字过滤：检索框输入 keyword-match-here
    $kw = Find-Edit $appRoot "关键字" $false 5
    if (-not $kw) { $kw = Find-Edit $appRoot "检索消息" $true 3 }
    if (-not $kw) { $kw = Find-ByName $appRoot "检索消息" $false 3 }
    if ($kw) {
        Set-Value $kw "keyword-match-here"
        Start-Sleep -Seconds 2
        $matched = Find-AllByName $appRoot "keyword-match-here"
        Assert "关键字过滤生效（命中行渲染）" ($matched.Count -ge 1)
    } else {
        Assert "关键字过滤（检索框未找到）" $false
    }

    # 信号徽章：FATAL/ANR → 状态栏信号计数
    $signal = Find-ByName $appRoot "信号" $true 6
    Assert "状态栏信号计数出现" ($null -ne $signal)

    # ===== 7. 多会话 Tab 栏 =====
    $tabPlus = Find-ByName $appRoot "全部日志" $true 5
    Assert "多会话 Tab 栏存在（全部日志）" ($null -ne $tabPlus)
}
finally {
    Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue
    Set-ReaderFlag $false
    Restore-Settings
}

Write-Host ""
Write-Host "端到端联调：$checks 项检查，失败 $($fails.Count)"
if ($fails.Count -gt 0) {
    Write-Host "未通过：$($fails -join '、')"
    exit 1
}
Write-Host "v6 无真机端到端联调全绿（fake-adb 模拟设备 + UIA 驱动 WebView2）"
