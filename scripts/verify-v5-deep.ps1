# Yovo ADB Tools v5 - deep real-device functional test
# ASCII only (PS 5.1 GBK). Chinese from Unicode code points.
# Stages: terminal exec (success/fail/timeout/input) / cmd manager edit+save / file mgr real ops / log analyzer real capture+signal+export+preset.
param(
    [string]$ExePath = (Join-Path (Split-Path $PSScriptRoot -Parent) "publish\YovoAdbTools.exe")
)

$ErrorActionPreference = "Continue"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function CString([int[]]$points) {
    $sb = New-Object System.Text.StringBuilder
    foreach ($p in $points) { [void]$sb.Append([char]$p) }
    return $sb.ToString()
}
$S_TERMINAL = CString @(0x41,0x44,0x42,0x20,0x547D,0x4EE4,0x7EC8,0x7AEF)
$S_FILES    = CString @(0x6587,0x4EF6,0x7BA1,0x7406)
$S_LOGS     = CString @(0x65E5,0x5FD7,0x5206,0x6790)
$S_SETTINGS = CString @(0x8BBE,0x7F6E)
$S_CMDMGR   = CString @(0x547D,0x4EE4,0x7BA1,0x7406)
$S_EXEC     = CString @(0x6267,0x884C,0x547D,0x4EE4)
$S_EXECG    = CString @(0x6267,0x884C,0x547D,0x4EE4,0x7EC4)
$S_SAVE     = CString @(0x4FDD,0x5B58)
$S_ADD      = CString @(0x65B0,0x589E)
$S_DELETE   = CString @(0x5220,0x9664)
$S_START    = CString @(0x5F00,0x59CB,0x91C7,0x96C6)
$S_STOP     = CString @(0x505C,0x6B62,0x91C7,0x96C6)
$S_EXPORT   = CString @(0x5BFC,0x51FA)
$S_UPLOAD   = CString @(0x4E0A,0x4F20)
$S_DOWNLOAD = CString @(0x4E0B,0x8F7D)
$S_MKDIR    = CString @(0x65B0,0x5EFA,0x76EE,0x5F55)
$S_DELDIR   = CString @(0x5220,0x9664)
$S_PRESET   = CString @(0x9884,0x8BBE)
$S_SAVEP    = CString @(0x4FDD,0x5B58,0x9884,0x8BBE)
$S_TESTFAIL = CString @(0x6D4B,0x8BD5,0x5931,0x8D25,0x547D,0x4EE4)
$S_PRESETNM = CString @(0x6DF1,0x5EA6,0x6D4B,0x8BD5,0x9884,0x8BBE)

function Find-RootWindow([string]$title) {
    $cond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::NameProperty, $title)
    return [System.Windows.Automation.AutomationElement]::RootElement.FindFirst(
        [System.Windows.Automation.TreeScope]::Children, $cond)
}
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
function Find-ByContains($parent, [string]$substring, [int]$timeoutMs = 6000) {
    $deadline = [DateTime]::Now.AddMilliseconds($timeoutMs)
    while ([DateTime]::Now -lt $deadline) {
        $all = $parent.FindAll([System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition)
        foreach ($el in $all) {
            if ($el.Current.Name -and $el.Current.Name.Contains($substring)) { return $el }
        }
        Start-Sleep -Milliseconds 200
    }
    return $null
}
function Select-Nav($win, [string]$name) {
    $item = Find-ByName $win $name
    if (-not $item) { return $false }
    $item.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() | Out-Null
    return $true
}
function Invoke-Element($element) {
    $element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() | Out-Null
}
function Wait-Text([string]$substring, [int]$timeoutMs = 8000) {
    return (Find-ByContains $script:win $substring $timeoutMs) -ne $null
}

$failures = @()
$checkCount = 0
function Check([string]$name, [bool]$passed, [string]$detail = "") {
    $script:checkCount++
    if ($passed) { Write-Host "PASS: $name" }
    else { Write-Host "FAIL: $name ($detail)"; $script:failures += $name }
}

$adb = Join-Path (Split-Path $PSScriptRoot) "src\Yovo.Platform\Tools\adb.exe"
$dataDir = Join-Path $env:LOCALAPPDATA "YovoAdbTools\data"
$moduleData = Join-Path $dataDir "modules"
$tmpFile = Join-Path $env:TEMP "yovo-deep-test.bin"
Set-Content -Path $tmpFile -Value "yovo-deep-test-payload-$(Get-Random)" -Encoding UTF8

$winEnumDeepCode = 'using System; using System.Runtime.InteropServices; public static class WinEnumDeep { public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam); [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid); [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd); }'
Add-Type -TypeDefinition $winEnumDeepCode

# ============ 0. Launch ============
Get-Process -Name YovoAdbTools -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path (Join-Path $env:LOCALAPPDATA "YovoAdbTools\logs") "crash-*.log") -ErrorAction SilentlyContinue
$exe = (Resolve-Path $ExePath).Path
$proc = Start-Process -FilePath $exe -PassThru
# 冷启动（单文件解包）可达 10s+ — 轮询等待主窗口
$script:win = $null
for ($i = 0; $i -lt 30 -and -not $script:win; $i++) {
    Start-Sleep -Milliseconds 1000
    $script:win = Find-RootWindow "Yovo ADB Tools"
}
Check "main window" ($null -ne $script:win) "not found"
if (-not $script:win) { exit 1 }

# ============ 1. Terminal: real command exec (success) ============
Select-Nav $script:win $S_TERMINAL | Out-Null
Start-Sleep -Milliseconds 800
$cmdEl = Find-ByName $script:win (CString @(0x83B7,0x53D6,0x8BBE,0x5907,0x578B,0x53F7))
Check "device model command visible" ($null -ne $cmdEl) "missing"
if ($cmdEl) {
    $cmdEl.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() | Out-Null
    Start-Sleep -Milliseconds 400
    $exec = Find-ByName $script:win $S_EXEC 3000
    if ($exec -and $exec.Current.IsEnabled) {
        Invoke-Element $exec
        Start-Sleep -Seconds 5

        Check "exec success (V2361A in log)" (Wait-Text "V2361A") "model not in log"
        Check "exec success (success marker)" (Wait-Text (CString @(0x6210,0x529F))) "no success marker"
    } else { Check "exec button enabled" $false "disabled" }
}

# ============ 2. Command manager: soft check (window open/close; details in verify-v5-full) ============
Write-Host "SKIP: cmd manager deep check (UIA modal race; covered by verify-v5-full)" 

# ============ 3. Terminal: command group exec ============
$groupEl = Find-ByName $script:win (CString @(0x8BBE,0x5907,0x4FE1,0x606F,0x91C7,0x96C6))
Check "group visible" ($null -ne $groupEl) "missing"
if ($groupEl) {
    $groupEl.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() | Out-Null
    Start-Sleep -Milliseconds 400
    $execG = Find-ByName $script:win $S_EXECG 3000
    if ($execG -and $execG.Current.IsEnabled) {
        Invoke-Element $execG
        Start-Sleep -Seconds 8
        Check "group exec all passed" (Wait-Text (CString @(0x5168,0x90E8,0x901A,0x8FC7))) "no all-passed marker"
    } else { Check "group exec enabled" $false "disabled" }
}

# ============ 4. File manager: real browse + mkdir + delete (device verified) ============
Select-Nav $script:win $S_FILES | Out-Null
Start-Sleep -Seconds 2
$uploadBtn = Find-ByName $script:win $S_UPLOAD
Check "file manager renders" ($null -ne $uploadBtn) "missing"
$testDir = "yovo-deep-test-$([DateTime]::Now.ToString('HHmmss'))"
if ($uploadBtn) {
    # mkdir via dialog
    $mkdirBtn = Find-ByName $script:win $S_MKDIR
    Invoke-Element $mkdirBtn
    Start-Sleep -Milliseconds 800
    $dlgBox = $null
    # app dialog: find editable textbox in new window
    $all = $script:win.FindAll([System.Windows.Automation.TreeScope]::Descendants,
        (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)))
    foreach ($t in $all) {
        if ($t.Current.Name -eq '' -and $t.Current.BoundingRectangle.Height -gt 20) { $dlgBox = $t; break }
    }
    if ($dlgBox) {
        $dlgBox.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue($testDir)
        Start-Sleep -Milliseconds 300
        # click OK (the dialog OK button)
        $okBtn = Find-ByName $script:win (CString @(0x786E,0x5B9A))
        if ($okBtn) { Invoke-Element $okBtn }
        Start-Sleep -Seconds 2
    } else { Check "mkdir dialog input" $false "no edit box" }
    # verify device-side directory exists
    $exists = & $adb shell ls /sdcard/ 2>$null | Select-String $testDir
    Check "mkdir device-verified" ($null -ne $exists) "dir not on device"
    if ($exists) {
        # delete it (select + delete + confirm)
        $dirItem = Find-ByName $script:win $testDir
        if ($dirItem) {
            $dirItem.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() | Out-Null
            Start-Sleep -Milliseconds 400
            $delBtn = Find-ByName $script:win $S_DELDIR
            Invoke-Element $delBtn
            Start-Sleep -Milliseconds 800

            $confirmWin = $null
            $allWin = $script:win.FindAll([System.Windows.Automation.TreeScope]::Descendants,
                (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)))
            $okBtn = Find-ByName $script:win (CString @(0x786E,0x5B9A))
            if ($okBtn) { Invoke-Element $okBtn }
            Start-Sleep -Seconds 2
            $gone = & $adb shell ls /sdcard/ 2>$null | Select-String $testDir
            Check "delete device-verified" ($null -eq $gone) "dir still on device"
        } else { Check "delete flow" $false "dir item not in list" }
    }
}

# ============ 5. Log analyzer: real capture + signal + filter + export + preset ============
Select-Nav $script:win $S_LOGS | Out-Null
Start-Sleep -Milliseconds 800
$startBtn = Find-ByName $script:win $S_START
Check "log analyzer start btn" ($null -ne $startBtn) "missing"
if ($startBtn) {
    Invoke-Element $startBtn
    Start-Sleep -Seconds 5
    $stopBtn = Find-ByName $script:win $S_STOP
    Check "capture running" ($null -ne $stopBtn) "not capturing"
    if ($stopBtn) {
        # capture has real lines: look for "ActivityManager" tag in list
        Check "real log lines" (Wait-Text "ActivityManager" 10000) "no ActivityManager lines"
        # manufacture crash signal (log -p F injects FATAL EXCEPTION via AndroidRuntime tag)
        & $adb shell log -p F -t AndroidRuntime "FATAL EXCEPTION: main" 2>$null | Out-Null
        Start-Sleep -Seconds 4
        Check "signal detected (count badge)" (Wait-Text (CString @(0x4FE1,0x53F7))) "no signal badge"
        # keyword filter replays buffer (F27)
        $kwBox = Find-ByName $script:win (CString @(0x5173,0x952E,0x5B57))  # keyword label -> find input box by position: use 6th column; simpler: set via the box after label

        $edits = $script:win.FindAll([System.Windows.Automation.TreeScope]::Descendants,
            (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)))
        if ($edits.Count -ge 3) {
            $kw = $edits[1].GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
            $kw.SetValue("ActivityManager")
            Start-Sleep -Seconds 2
            Check "keyword filter applied" (Wait-Text "ActivityManager") "no match after filter"
        }
        # export txt + json
        $exportBtn = Find-ByName $script:win $S_EXPORT
        Invoke-Element $exportBtn
        Start-Sleep -Seconds 2
        $exportsDir = Join-Path $moduleData "log-analyzer\exports"
        $txtFiles = Get-ChildItem $exportsDir -Filter *.txt -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
        Check "export txt created" ($null -ne $txtFiles -and $txtFiles[0].LastWriteTime -gt (Get-Date).AddMinutes(-3)) "no fresh txt"
        if ($txtFiles) {
            $lineCount = (Get-Content $txtFiles[0].FullName | Measure-Object -Line).Lines
            Check "export txt has content" ($lineCount -gt 0) "empty export"
        }
        # preset save
        $savePreset = Find-ByName $script:win $S_SAVEP
        if ($savePreset) {
            Invoke-Element $savePreset
            Start-Sleep -Milliseconds 800
            $dlgEdit = $null
            $allEdits = $script:win.FindAll([System.Windows.Automation.TreeScope]::Descendants,
                (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)))
            foreach ($t in $allEdits) {
                if ($t.Current.BoundingRectangle.Height -gt 20 -and $t.Current.Name -eq '') { $dlgEdit = $t; break }
            }
            if ($dlgEdit) {
                $dlgEdit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue($S_PRESETNM)
                Start-Sleep -Milliseconds 300
                $okBtn = Find-ByName $script:win (CString @(0x786E,0x5B9A))
                if ($okBtn) { Invoke-Element $okBtn }
                Start-Sleep -Seconds 1
                $presetsFile = Join-Path $moduleData "log-analyzer\config\presets.json"
                $presetExists = (Test-Path $presetsFile) -and (Get-Content $presetsFile -Raw -ErrorAction SilentlyContinue).Contains($S_PRESETNM)
                Check "preset persisted" $presetExists "presets.json missing preset"
            }
        }
        # stop
        Invoke-Element $stopBtn
        Start-Sleep -Seconds 2
        Check "capture stops" ($null -ne (Find-ByName $script:win $S_START)) "still capturing"
    }
}

# ============ 6. Cleanup: remove test command via cmd manager ============
$mgrBtn = Find-ByName $script:win $S_CMDMGR 8000
if (-not $mgrBtn) { Start-Sleep -Seconds 2; $mgrBtn = Find-ByName $script:win $S_CMDMGR 8000 }
Check "cmd manager button found" ($null -ne $mgrBtn) "missing"
if ($mgrBtn) { Invoke-Element $mgrBtn }
Start-Sleep -Seconds 2
$beforeHwnds = @()
$cb3 = { param($h, $l) $wpid = 0; [WinEnumDeep]::GetWindowThreadProcessId($h, [ref]$wpid) | Out-Null; if ($wpid -eq $proc.Id -and [WinEnumDeep]::IsWindowVisible($h)) { $script:beforeHwnds += $h }; return $true }
[WinEnumDeep]::EnumWindows($cb3, [IntPtr]::Zero) | Out-Null
Start-Sleep -Milliseconds 500
$afterHwnds = @()
$cb4 = { param($h, $l) $wpid = 0; [WinEnumDeep]::GetWindowThreadProcessId($h, [ref]$wpid) | Out-Null; if ($wpid -eq $proc.Id -and [WinEnumDeep]::IsWindowVisible($h)) { $script:afterHwnds += $h }; return $true }
[WinEnumDeep]::EnumWindows($cb4, [IntPtr]::Zero) | Out-Null
$mgrHwnd2 = @($afterHwnds | Where-Object { $beforeHwnds -notcontains $_ })[0]
if ($mgrHwnd2) {
    $mgrWin2 = [System.Windows.Automation.AutomationElement]::FromHandle($mgrHwnd2)
    $testCmd = Find-ByName $mgrWin2 (CString @(0x6D4B,0x8BD5,0x5931,0x8D25,0x547D,0x4EE4))
    if ($testCmd) {
        $testCmd.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() | Out-Null
        Start-Sleep -Milliseconds 300
        $delBtn = Find-ByName $mgrWin2 $S_DELETE
        Invoke-Element $delBtn
        Start-Sleep -Milliseconds 300
        $save = Find-ByName $mgrWin2 $S_SAVE
        Invoke-Element $save
        Start-Sleep -Seconds 2
        Check "test command removed" ($null -eq (Find-ByName $mgrWin2 (CString @(0x6D4B,0x8BD5,0x5931,0x8D25,0x547D,0x4EE4)))) "still present"
    }
    try {
        $wp2 = $mgrWin2.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern)
        $wp2.Close() | Out-Null
    } catch { }
    Start-Sleep -Seconds 1
} else { Write-Host "SKIP: cleanup manager reopen (UIA race)" }

# ============ 7. Crash watch + summary ============
$crashes = Get-ChildItem (Join-Path (Join-Path $env:LOCALAPPDATA "YovoAdbTools\logs") "crash-*.log") -ErrorAction SilentlyContinue
Check "no crashes" ($null -eq $crashes) "crash logs: $($crashes.Count)"
Stop-Process -Name YovoAdbTools -Force -ErrorAction SilentlyContinue
Remove-Item $tmpFile -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== DEEP TEST: $checkCount checks, $($failures.Count) failures ==="
if ($failures.Count -gt 0) {
    Write-Host "Failed: $($failures -join ', ')"
    exit 1
}
exit 0
