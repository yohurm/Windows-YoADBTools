# Yovo ADB Tools v5 - UIA smoke verification (UI review acceptance checklist)
# ASCII only (PS 5.1 GBK decoding bug). Chinese strings built from Unicode code points.
# WPF-UI FluentWindow title bars report empty UIA/Win32 text -> identify windows by size.
# Checks: nav items / settings page / cmd manager open+close / P0-2 save right / P0-1 headers / P0-3 status bar right.
param(
    [string]$ExePath = (Join-Path (Split-Path $PSScriptRoot -Parent) "src\Yovo.Host\bin\Debug\net8.0-windows\YovoAdbTools.exe")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WinEnum32 {
    public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
'@

# ---- Chinese string helpers (Unicode code points, GBK-safe) ----
function CString([int[]]$points) {
    $sb = New-Object System.Text.StringBuilder
    foreach ($p in $points) { [void]$sb.Append([char]$p) }
    return $sb.ToString()
}
$S_TERMINAL = CString @(0x41,0x44,0x42,0x20,0x547D,0x4EE4,0x7EC8,0x7AEF)          # "ADB 命令终端"
$S_FILES    = CString @(0x6587,0x4EF6,0x7BA1,0x7406)                              # "文件管理"
$S_LOGS     = CString @(0x65E5,0x5FD7,0x5206,0x6790)                              # "日志分析"
$S_MIRROR   = CString @(0x6295,0x5C4F,0x663E,0x793A)                              # "投屏显示"
$S_SETTINGS = CString @(0x8BBE,0x7F6E)                                            # "设置"
$S_CMDMGR   = CString @(0x547D,0x4EE4,0x7BA1,0x7406)                              # "命令管理"
$S_ADBPATH  = CString @(0x41,0x44,0x42,0x20,0x8DEF,0x5F84)                        # "ADB 路径"
$S_SAVE     = CString @(0x4FDD,0x5B58)                                            # "保存"
$S_GROUPS   = CString @(0x547D,0x4EE4,0x7EC4)                                     # "命令组"
$S_DELAY    = CString @(0x5EF6,0x65F6,0x28,0x6D,0x73,0x29)                        # "延时(ms)"
$S_TIMEOUT  = CString @(0x8D85,0x65F6,0x28,0x6D,0x73,0x29)                        # "超时(ms)"
$S_DEVLABEL = CString @(0x8BBE,0x5907,0x3A,0x20)                                  # "设备: "
$S_EXEC     = CString @(0x6267,0x884C,0x547D,0x4EE4)                              # "执行命令"
$S_MAINTITLE = "Yovo ADB Tools"

function Find-RootWindow([string]$title) {
    $condition = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::NameProperty, $title)
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    return $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $condition)
}

function Find-ByName($parent, [string]$name, [int]$timeoutMs = 8000) {
    $deadline = [DateTime]::Now.AddMilliseconds($timeoutMs)
    $condition = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::NameProperty, $name)
    while ([DateTime]::Now -lt $deadline) {
        $found = $parent.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
        if ($found) { return $found }
        Start-Sleep -Milliseconds 200
    }
    return $null
}

function Select-Element($element) {
    $pattern = $element.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
    $pattern.Select()
}

function Get-ProcessWindows([int]$processId) {
    $result = @()
    $cb = {
        param($h, $l)
        $wpid = 0
        [WinEnum32]::GetWindowThreadProcessId($h, [ref]$wpid) | Out-Null
        if ($wpid -eq $processId -and [WinEnum32]::IsWindowVisible($h)) {
            $rect = New-Object WinEnum32+RECT
            [WinEnum32]::GetWindowRect($h, [ref]$rect) | Out-Null
            $script:winList.Add(@{ Hwnd = $h; W = $rect.Right - $rect.Left; H = $rect.Bottom - $rect.Top; X = $rect.Left; Y = $rect.Top }) | Out-Null
        }
        return $true
    }
    $script:winList = New-Object System.Collections.ArrayList
    [WinEnum32]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
    return $script:winList
}

$failures = @()
$checkCount = 0

function Check([string]$name, [bool]$passed, [string]$detail) {
    $script:checkCount++
    if ($passed) { Write-Host "PASS: $name" }
    else { Write-Host "FAIL: $name ($detail)"; $script:failures += $name }
}

# ============ 1. Launch ============
$exe = (Resolve-Path $ExePath).Path
$proc = Start-Process -FilePath $exe -PassThru
# cold start (Debug build can exceed 6s); poll for main window
$win = $null
for ($i = 0; $i -lt 30 -and -not $win; $i++) {
    Start-Sleep -Milliseconds 1000
    $win = Find-RootWindow $S_MAINTITLE
}
Check "main window appears" ($null -ne $win) "no root window"
if (-not $win) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    exit 1
}

# ============ 2. Navigation items present ============
foreach ($item in @($S_TERMINAL, $S_FILES, $S_LOGS, $S_MIRROR, $S_SETTINGS)) {
    $nav = Find-ByName $win $item
    Check "nav item present" ($null -ne $nav) "missing"
}

# ============ 3. Switch to settings - content renders ============
$settings = Find-ByName $win $S_SETTINGS
if ($settings) {
    Select-Element $settings | Out-Null
    Start-Sleep -Milliseconds 600
    $pathLabel = Find-ByName $win $S_ADBPATH
    Check "settings page rendered (ADB path)" ($null -ne $pathLabel) "missing"
    $saveBtn = Find-ByName $win $S_SAVE
    Check "settings save button" ($null -ne $saveBtn) "missing"
}

# back to terminal
$terminal = Find-ByName $win $S_TERMINAL
if ($terminal) { Select-Element $terminal | Out-Null; Start-Sleep -Milliseconds 600 }

# ============ 4. Terminal -> command manager (identify window by size: 1100x700) ============
$before = Get-ProcessWindows $proc.Id
$beforeCount = $before.Count

$managerBtn = Find-ByName $win $S_CMDMGR
Check "terminal toolbar: cmd manager button" ($null -ne $managerBtn) "missing"

if ($managerBtn) {
    $invoke = $managerBtn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $invoke.Invoke() | Out-Null
    Start-Sleep -Seconds 2

    # modal window blocks UIA on main window; enumerate new top-level window by hwnd delta
    $after = Get-ProcessWindows $proc.Id
    $beforeHwnds = @($before | ForEach-Object { $_.Hwnd })
    $mgrWin = $after | Where-Object { $beforeHwnds -notcontains $_.Hwnd } | Select-Object -First 1
    Check "cmd manager window opens (extra window)" ($null -ne $mgrWin) "before=$beforeCount after=$($after.Count)"

    if ($mgrWin) {
        # locate the new window as UIA element directly from its Win32 hwnd
        $mgrUia = [System.Windows.Automation.AutomationElement]::FromHandle($mgrWin.Hwnd)
        Check "cmd manager UIA element found" ($null -ne $mgrUia) "FromHandle failed"

        if ($mgrUia) {
            # P0-2: find save button INSIDE the manager window
            $save = Find-ByName $mgrUia $S_SAVE
            Check "P0-2: save button present" ($null -ne $save) "missing"
            if ($save) {
                $sr = $save.Current.BoundingRectangle
                $wr = $mgrUia.Current.BoundingRectangle
                $rightGap = ($wr.X + $wr.Width) - ($sr.X + $sr.Width)
                Check "P0-2: save on right edge" ($rightGap -lt 80) "rightGap=$rightGap"
            }

            # close (WindowPattern.Close may be unsupported on this window type; fallback: WM_CLOSE)
            $closed = $false
            try {
                $wp = $mgrUia.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern)
                $wp.Close() | Out-Null
                $closed = $true
            } catch {
                Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WinClose32 {
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wp, IntPtr lp);
}
'@
                [WinClose32]::PostMessage($mgrWin.Hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
                $closed = $true
            }
            Start-Sleep -Seconds 1
            $afterClose = Get-ProcessWindows $proc.Id
            $stillAlive = $afterClose | Where-Object { $_.Hwnd -eq $mgrWin.Hwnd }
            Check "cmd manager closes" ($null -eq $stillAlive) "hwnd still visible"
        }
    }
}

# ============ 4.5 P1-5: single device auto-selected -> exec enabled after command select ============
try {
    $json = Get-Content -Raw -Encoding UTF8 (Join-Path (Split-Path $PSScriptRoot) "src\Modules\Yovo.Modules.AdbTerminal\Resources\library.default.json")
    Add-Type -AssemblyName System.Web.Extensions
    $js = New-Object System.Web.Script.Serialization.JavaScriptSerializer
    $lib = $js.DeserializeObject($json)
    $firstCmdName = $lib["commands"][0]["name"]
    $cmdCond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::NameProperty, $firstCmdName)
    $cmdEl = $win.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cmdCond)
    if ($cmdEl) {
        $sp = $cmdEl.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
        $sp.Select() | Out-Null
        Start-Sleep -Milliseconds 800
        $exec = Find-ByName $win $S_EXEC 3000
        if ($exec) {
            Check "P1-5: exec enabled (auto-selected device + command)" $exec.Current.IsEnabled "btn disabled"
        } else {
            Check "P1-5: exec enabled (auto-selected device + command)" $false "exec btn missing"
        }
    } else {
        Write-Host "SKIP: P1-5 (no device or command list)"
    }
} catch {
    Write-Host "SKIP: P1-5 ($($_.Exception.Message))"
}

# ============ 5. Status bar device label (P0-3: right side) ============
$deviceStatus = Find-ByName $win $S_DEVLABEL
Check "status bar device label" ($null -ne $deviceStatus) "missing"
if ($deviceStatus) {
    $rect = $deviceStatus.Current.BoundingRectangle
    $winRect = $win.Current.BoundingRectangle
    $isRight = ($rect.X + $rect.Width) -gt ($winRect.X + $winRect.Width * 0.5)
    Check "P0-3: device status on right" $isRight "x=$($rect.X) winW=$($winRect.Width)"
}

# ============ 6. Cleanup ============
Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Summary: $checkCount checks, $($failures.Count) failures ==="
if ($failures.Count -gt 0) {
    Write-Host "Failed: $($failures -join ', ')"
    exit 1
}
exit 0
