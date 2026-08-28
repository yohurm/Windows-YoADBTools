# Yohu ADB Tools v6 — UIA 驱动 WebView2 无障碍树的共享助手
# 供 scripts/verify-v6-real.ps1 与 scripts/verify-v6-e2e.ps1 用 dot-source 复用。
# 仅重构：从两个脚本抽出完全相同的函数，行为不变（函数语义等价，错误消息统一为英文）。
#
# 原理：SPI_SETSCREENREADER 强制激活 WebView2 无障碍树 -> UIA 枚举 DOM 元素并按名交互。
# 依赖：UIAutomationClient / UIAutomationTypes（Add-Type）。

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

# 断言计数/失败列表（dot-source 后在调用脚本的 script 作用域内）。
$script:checks = 0
$script:fails = @()

function Assert($name, [bool]$ok) {
    $script:checks++
    if ($ok) { Write-Host "  OK：$name" } else { Write-Host "  FAIL：$name"; $script:fails += $name }
}

function Set-ReaderFlag([bool]$on) {
    [SysParam]::SystemParametersInfo(0x0046, [uint32]$(if ($on) { 1 } else { 0 }), [IntPtr]::Zero, 0) | Out-Null
}

function Wait-AppRoot([int]$procId, [int]$timeoutSec = 30) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        $root = [System.Windows.Automation.AutomationElement]::RootElement
        $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
        foreach ($e in $all) {
            if ($e.Current.ControlType.ProgrammaticName -eq "ControlType.Document" -and $e.Current.Name -eq "Yohu ADB Tools") {
                return $e
            }
        }
        Start-Sleep -Milliseconds 500
    }
    throw "WebView2 document not found"
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

function Find-ButtonNow($scope, [string]$name) {
    $all = $scope.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($e in $all) {
        if ($e.Current.Name -eq $name -and $e.Current.ControlType.ProgrammaticName -eq "ControlType.Button") {
            return $e
        }
    }
    return $null
}

function Find-Button($scope, [string]$name, [int]$timeoutSec = 10) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        $btn = Find-ButtonNow $scope $name
        if ($btn) { return $btn }
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
    throw "element not invokable: $($element.Current.Name)"
}

function Set-Value($element, [string]$text) {
    $pattern = $null
    if (-not $element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
        throw "element does not support ValuePattern: $($element.Current.ControlType.ProgrammaticName) name=$($element.Current.Name)"
    }
    $pattern.SetValue($text)
}

function Invoke-DialogButton($scope, [string]$dialogName, [string]$buttonName) {
    $hits = Find-AllByName $scope $dialogName
    foreach ($hit in $hits) {
        $btn = Find-ButtonNow $hit $buttonName
        if ($btn) { Invoke-Click $btn; return $true }
    }
    return $false
}
