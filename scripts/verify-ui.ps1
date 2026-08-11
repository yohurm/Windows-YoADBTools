# UI 自驱动验证：启动应用 -> 遍历面板 -> 量化按钮/列宽 -> 报告截断与缺失
# 用法: powershell -ExecutionPolicy Bypass -File scripts/verify-ui.ps1
# NOTE: keep this file pure ASCII (PowerShell 5.1 ANSI/GBK decoding issue with UTF-8 no-BOM)

param(
    [string]$ExePath = "",
    [int]$WaitSeconds = 5
)

Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes

function Get-Current-Pid {
    $proc = Get-Process FactoryHelper -ErrorAction SilentlyContinue
    if ($proc) { return $proc[0].Id }
    return 0
}

# Launch app if not running
$pid0 = Get-Current-Pid
if ($pid0 -eq 0) {
    if ($ExePath -eq "") { $ExePath = Join-Path $PSScriptRoot "..\src\FactoryHelper\bin\Debug\net8.0-windows\FactoryHelper.exe" }
    Write-Output "Launching: $ExePath"
    Start-Process -FilePath $ExePath
    Start-Sleep -Seconds $WaitSeconds
}
$pid0 = Get-Current-Pid
if ($pid0 -eq 0) { Write-Output "FAIL: app not running"; exit 1 }
Write-Output "App PID: $pid0"

$p = Get-Process -Id $pid0
$win = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
Write-Output "Main window: $($win.Current.Name)"

# ============ helpers ============
function Get-TextWidth([string]$name) {
    # rough estimate: CJK char ~12px, ascii ~6px at FontSize 12
    $w = 0.0
    foreach ($ch in $name.ToCharArray()) {
        if ([int]$ch -gt 0x2E80) { $w += 12 } else { $w += 6 }
    }
    return $w
}

function Report-Buttons([System.Windows.Automation.AutomationElement]$rootEl, [string]$label) {
    $btnCond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
    $btns = $rootEl.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond)
    Write-Output "--- $label : $($btns.Count) buttons ---"
    foreach ($b in $btns) {
        $n = $b.Current.Name
        if ($n.Length -eq 0) { continue }
        $r = $b.Current.BoundingRectangle
        $textW = Get-TextWidth $n
        $need = $textW + 30   # padding + margins
        $mark = ""
        if ($r.Width -lt $need) { $mark = " <== CLIPPED (need ~$([int]$need)px)" }
        Write-Output ("  [$n] w=$([int]$r.Width)px text~$([int]$textW)px$mark")
    }
}

function Get-ListItems([System.Windows.Automation.AutomationElement]$rootEl) {
    $itemCond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::ListItem)
    return $rootEl.FindAll([System.Windows.Automation.TreeScope]::Descendants, $itemCond)
}

# ============ 1. main window nav items ============
$items = Get-ListItems $win
Write-Output "Nav/panel items: $($items.Count)"
$navNames = @()
foreach ($it in $items) {
    $n = $it.Current.Name
    if ($n -match '^(ADB|FactoryHelper|投屏|文件|日志|设置)') { $navNames += $n }
}
Write-Output ("Nav candidates: " + ($navNames -join ' | '))

# ============ 2. terminal panel buttons ============
Report-Buttons $win "Terminal panel (initial)"

# ============ 3. open input panel: select a command with inputs ============
# First command item (CommandDefinition) - select it, then check buttons again
$cmdItem = $null
foreach ($it in $items) {
    if ($it.Current.Name -like 'FactoryHelper.Modules.AdbTerminal.Models.CommandDefinition*') { $cmdItem = $it; break }
}
if ($cmdItem) {
    $cmdItem.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()
    Start-Sleep -Milliseconds 800
    Report-Buttons $win "Terminal panel (command selected)"
}

# ============ 4. open command manager ============
$mgrName = -join [char[]]@(0x547D, 0x4EE4, 0x7BA1, 0x7406)  # command manager
$btnCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
$btns = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond)
foreach ($b in $btns) { if ($b.Current.Name -eq $mgrName) { $b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); break } }
Start-Sleep 2

# enumerate windows to find manager (title has length)
Add-Type -Name NativeWin -Namespace Native -MemberDefinition @"
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern int GetWindowTextW(IntPtr h, System.Text.StringBuilder sb, int max);
    public delegate bool EnumWindowsProc(IntPtr h, IntPtr lp);
"@

$mgrHwnd = [IntPtr]::Zero
$cb = [Native.NativeWin+EnumWindowsProc]{
    param($h, $lp)
    $wp = [uint32]0
    [Native.NativeWin]::GetWindowThreadProcessId($h, [ref]$wp) | Out-Null
    if ($wp -eq $pid0 -and [Native.NativeWin]::IsWindowVisible($h)) {
        $sb = New-Object System.Text.StringBuilder 128
        [Native.NativeWin]::GetWindowTextW($h, $sb, 128) | Out-Null
        if ($sb.Length -gt 0 -and $sb.ToString() -ne $win.Current.Name) { $script:mgrHwnd = $h }
    }
    return $true
}
[Native.NativeWin]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null

if ($mgrHwnd -ne [IntPtr]::Zero) {
    $mgr = [System.Windows.Automation.AutomationElement]::FromHandle($mgrHwnd)
    Write-Output "Command manager window found"
    Report-Buttons $mgr "Command manager (commands tab)"

    # switch to groups tab
    $tabName = -join [char[]]@(0x547D, 0x4EE4, 0x7EC4)  # command group tab
    $tabCond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem)
    $tabs = $mgr.FindAll([System.Windows.Automation.TreeScope]::Descendants, $tabCond)
    foreach ($t in $tabs) { if ($t.Current.Name -eq $tabName) { $t.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select(); break } }
    Start-Sleep 1

    # check title bar buttons (minimize/maximize/close)
    $tb = $mgr.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond)
    $tbNames = @()
    foreach ($b in $tb) { if ($b.Current.Name.Length -gt 0) { $tbNames += $b.Current.Name } }
    Write-Output ("Manager buttons total: " + ($tbNames -join ' | '))

    Report-Buttons $mgr "Command manager (groups tab)"

    # DataGrid column check
    $headerCond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::HeaderItem)
    $headers = $mgr.FindAll([System.Windows.Automation.TreeScope]::Descendants, $headerCond)
    Write-Output "DataGrid columns: $($headers.Count)"
    foreach ($hd in $headers) {
        $r = $hd.Current.BoundingRectangle
        Write-Output ("  col w=$([int]$r.Width)px")
    }
    # horizontal scrollbar check
    $scrollCond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::ScrollBar)
    $scrolls = $mgr.FindAll([System.Windows.Automation.TreeScope]::Descendants, $scrollCond)
    $hScroll = $false
    foreach ($s in $scrolls) {
        $r = $s.Current.BoundingRectangle
        if ($r.Width -gt $r.Height) { $hScroll = $true }
    }
    Write-Output ("Horizontal scrollbar: $hScroll")
} else {
    Write-Output "FAIL: command manager window not found"
}

Write-Output "=== VERIFY DONE ==="
