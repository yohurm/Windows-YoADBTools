# Yovo ADB Tools v5 - log analyzer multi-session (M1: F40-F44) real-device UIA verification
# Covers: tab creation (all/package) / process index status / per-tab close / capture on-off
# ASCII only (PS 5.1 GBK). Chinese from Unicode code points.
param(
    [string]$ExePath = "publish\YovoAdbTools.exe",
    [string]$Package = "com.ggec.hs01"
)

$ErrorActionPreference = "Continue"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function CString([int[]]$points) {
    $sb = New-Object System.Text.StringBuilder
    foreach ($p in $points) { [void]$sb.Append([char]$p) }
    return $sb.ToString()
}
$S_LOGS    = CString @(0x65E5,0x5FD7,0x5206,0x6790)   # 日志分析
$S_START   = CString @(0x5F00,0x59CB,0x91C7,0x96C6)   # 开始采集
$S_STOP    = CString @(0x505C,0x6B62,0x91C7,0x96C6)   # 停止采集
$S_PLUS    = CString @(0xFF0B)                        # ＋ (new session)
$S_ALLTAB  = CString @(0x5168,0x90E8,0x65E5,0x5FD7)   # 全部日志
$S_BYNAME  = CString @(0x6309,0x5305,0x540D,0x2026)   # 按包名…
$S_BYPID   = CString @(0x6309,0x20,0x50,0x49,0x44,0x2026) # "按 PID…"（XAML Header 含空格）
$S_DLGNAME = CString @(0x6309,0x5305,0x540D,0x65B0,0x5EFA,0x4F1A,0x8BDD) # 按包名新建会话
$S_OK      = CString @(0x786E,0x5B9A)                 # 确定
$S_CLOSE   = CString @(0x2715)                        # ✕
$S_INDEX   = CString @(0x7D22,0x5F15)                 # 索引 (status bar process index age)
$S_LEVEL   = CString @(0x7EA7,0x522B)                 # 级别 (filter bar)
$S_SEARCH  = CString @(0x68C0,0x7D22)                 # 检索 (filter bar)

function Find-ByName($parent, [string]$name, [int]$timeoutMs = 6000) {
    $deadline = [DateTime]::Now.AddMilliseconds($timeoutMs)
    $cond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::NameProperty, $name)
    while ([DateTime]::Now -lt $deadline) {
        $f = $parent.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
        if ($f) { return $f }
        Start-Sleep -Milliseconds 200
    }
    return $null
}
# PS 5.1 无法绑定 PropertyCondition 3 参构造（MatchSubstring）— 手动过滤
function Find-ByContains($parent, [string]$name, [int]$timeoutMs = 6000) {
    $deadline = [DateTime]::Now.AddMilliseconds($timeoutMs)
    while ([DateTime]::Now -lt $deadline) {
        $all = $parent.FindAll([System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition)
        foreach ($e in $all) {
            if ($e.Current.Name -and $e.Current.Name.Contains($name)) { return $e }
        }
        Start-Sleep -Milliseconds 200
    }
    return $null
}
# top-level window by name (dialog needs retry)
function Find-WindowByName($parent, [string]$name, [int]$timeoutMs = 8000) {
    $deadline = [DateTime]::Now.AddMilliseconds($timeoutMs)
    $cond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::NameProperty, $name)
    while ([DateTime]::Now -lt $deadline) {
        $f = $parent.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
        if ($f) { return $f }
        Start-Sleep -Milliseconds 300
    }
    return $null
}
function Find-TabsWithTitle($win, [string]$title) {
    # TabItem 的 UIA Name 是 VM 类型名（header 模板文本不冒泡）— 在 TabItem 内找标题 TextBlock
    $result = @()
    $tabs = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants,
        (New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::TabItem)))
    foreach ($t in $tabs) {
        $titleEl = $t.FindFirst([System.Windows.Automation.TreeScope]::Descendants,
            (New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::NameProperty, $title)))
        if ($titleEl) { $result += $t }
    }
    return $result
}
function Invoke-Element($element) {
    $element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() | Out-Null
}
function Set-Text($element, [string]$text) {
    $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue($text)
}
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class MC3 { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e); }'
function Click-Element($element) {
    $b = $element.Current.BoundingRectangle
    if ($b.Width -lt 1 -or $b.Height -lt 1) { return }
    [MC3]::SetCursorPos([int]($b.X + $b.Width/2), [int]($b.Y + $b.Height/2))
    Start-Sleep -Milliseconds 150
    [MC3]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
    [MC3]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
}
# 键盘（SendKeys：Ctrl+Shift+P 按包名对话框 / ESC 关闭菜单）
# SendKeys 发给前台窗口 — 必须先激活应用主窗口
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class WIN2 { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); }'
function Send-KeysTo([System.Windows.Automation.AutomationElement]$element, [string]$keys) {
    [WIN2]::SetForegroundWindow([IntPtr]$element.Current.NativeWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 300
    [System.Windows.Forms.SendKeys]::SendWait($keys)
}
$failures = @()
$checkCount = 0
function Check([string]$name, [bool]$passed, [string]$detail = "") {
    $script:checkCount++
    if ($passed) { Write-Host "PASS: $name" }
    else { Write-Host "FAIL: $name ($detail)"; $script:failures += $name }
}

# ============ launch ============
Get-Process -Name YovoAdbTools -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
$exe = (Resolve-Path $ExePath).Path
$proc = Start-Process -FilePath $exe -PassThru
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::NameProperty, "Yovo ADB Tools")
$win = $null
for ($i = 0; $i -lt 30 -and -not $win; $i++) {
    Start-Sleep -Milliseconds 1000
    $win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
}
Check "main window" ($null -ne $win) "not found"
if (-not $win) { exit 1 }

# to log analyzer
$nav = Find-ByName $win $S_LOGS
$nav.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() | Out-Null
Start-Sleep -Seconds 2

# ============ 1. default session tab + AS filter bar ============
$allTabs = Find-TabsWithTitle $win $S_ALLTAB
Check "default session tab (all logs)" ($allTabs.Count -eq 1) "found=$($allTabs.Count)"
$levelLabel = Find-ByName $win $S_LEVEL
Check "AS style filter bar (level)" ($null -ne $levelLabel) "missing"
$searchBox = Find-ByName $win $S_SEARCH
Check "AS style filter bar (search)" ($null -ne $searchBox) "missing"

# ============ 2. start capture: process index appears in status bar ============
$startBtn = Find-ByName $win $S_START
Check "capture start button" ($null -ne $startBtn) "missing"
if ($startBtn) {
    # 物理点击（InvokePattern 在此场景偶发丢失）
    Click-Element $startBtn
    Start-Sleep -Seconds 4
    Check "capture running" ($null -ne (Find-ByName $win $S_STOP)) "stop btn missing"
}
$indexStatus = Find-ByContains $win $S_INDEX 8000
Check "process index running (status bar)" ($null -ne $indexStatus) "no index age text"

# ============ 3. new package session (menu click -> dialog) ============
# re-fetch main window (avoid stale handle after earlier UIA ops)
$win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children,
    (New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::NameProperty, "Yovo ADB Tools")))
$plusBtn = Find-ByName $win $S_PLUS
Check "new session button" ($null -ne $plusBtn) "missing"
if ($plusBtn) {
    # [+] 菜单打开且含三个入口（全部日志 / 按包名 / 按 PID）；
    # 程序化打开后菜单已 Focus → 物理点击菜单项（真实用户路径，Focus 修复后可靠）
    Click-Element $plusBtn
    Start-Sleep -Seconds 2
    $byName = Find-ByName $win $S_BYNAME 5000
    $byPid = Find-ByName $win $S_BYPID 2000
    Check "menu opens with entries" ($null -ne $byName -and $null -ne $byPid) "menu items missing"
    if ($byName) {
        # 菜单项已命令化（AddPackageSessionInteractiveCommand）→ InvokePattern 可靠
        Invoke-Element $byName
        Start-Sleep -Seconds 1
        # 注意：拥有者对话框在 UIA 中嵌套在主窗口 DESCENDANTS 下（非 root 子级）
        $dlg = $win.FindFirst([System.Windows.Automation.TreeScope]::Descendants,
            (New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::NameProperty, $S_DLGNAME)))
        Check "package dialog appears" ($null -ne $dlg) "window not found"
    if ($dlg) {
        $comboEdit = $dlg.FindFirst([System.Windows.Automation.TreeScope]::Descendants,
            (New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                [System.Windows.Automation.ControlType]::Edit)))
        if ($comboEdit) {
            Set-Text $comboEdit $Package
            Start-Sleep -Milliseconds 500
            $okBtn = $dlg.FindFirst([System.Windows.Automation.TreeScope]::Descendants,
                (New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::NameProperty, $S_OK)))
            if ($okBtn) { Invoke-Element $okBtn }
            Start-Sleep -Seconds 2
        }
        $pkgTabs = Find-TabsWithTitle $win $Package
        Check "package session tab created" ($pkgTabs.Count -eq 1) "found=$($pkgTabs.Count)"
        if ($pkgTabs.Count -eq 1) {
            # 选中包名会话 → PID 框禁用（Scope=Package 只读显示绑定列表）
            $pkgTabs[0].GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() | Out-Null
            Start-Sleep -Seconds 1
            $pidBox = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants,
                (New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                    [System.Windows.Automation.ControlType]::Edit)))
            $pkgPidBox = $null
            foreach ($e in $pidBox) {
                # PID 框是 Package 作用域下禁用的输入框（显示绑定 PID 列表）
                if (-not $e.Current.IsEnabled) { $pkgPidBox = $e; break }
            }
            Check "package session PID box read-only (bound pids)" ($null -ne $pkgPidBox) "no disabled pid box"
        }
    }
    }
}

# ============ 4. close package tab ============
$pkgTabs2 = Find-TabsWithTitle $win $Package 2000
if ($pkgTabs2.Count -eq 1) {
    # 关闭包名会话：找其 TabItem 内的 ✕ 按钮
    $closeBtn = $pkgTabs2[0].FindFirst([System.Windows.Automation.TreeScope]::Descendants,
        (New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::NameProperty, $S_CLOSE)))
    Check "tab close button" ($null -ne $closeBtn) "missing"
    if ($closeBtn) {
        Invoke-Element $closeBtn
        Start-Sleep -Seconds 2
        $remaining = Find-TabsWithTitle $win $S_ALLTAB
        Check "close tab restores default all" ($remaining.Count -eq 1) "found=$($remaining.Count)"
    }
} else {
    Check "tab close button" $false "package tab gone already"
}

# ============ 5. stop capture ============
$stopBtn = Find-ByName $win $S_STOP 4000
if ($stopBtn) {
    Click-Element $stopBtn # 物理点击（InvokePattern 在此场景不可靠）
    Start-Sleep -Seconds 2
    Check "capture stops (restart btn)" ($null -ne (Find-ByName $win $S_START)) "still capturing"
}

# ============ 6. crash watch ============
$crashDir = Join-Path $env:LOCALAPPDATA "YovoAdbTools\logs"
$crashes = Get-ChildItem $crashDir -Filter "crash-*.log" -ErrorAction SilentlyContinue
Check "no crash during multisession" ($null -eq $crashes -or $crashes.Count -eq 0) "crash logs found"

Stop-Process -Name YovoAdbTools -Force -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "=== MULTISESSION: $checkCount checks, $($failures.Count) failures ==="
if ($failures.Count -gt 0) {
    Write-Host "Failed: $($failures -join ', ')"
    exit 1
}
exit 0
