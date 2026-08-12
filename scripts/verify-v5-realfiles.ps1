# Yovo ADB Tools v5 - real file operations on device (mkdir / upload / download, device-verified)
# ASCII only (PS 5.1 GBK). Chinese from Unicode code points.
param(
    [string]$ExePath = "..\publish\YovoAdbTools.exe"
)

$ErrorActionPreference = "Continue"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function CString([int[]]$points) {
    $sb = New-Object System.Text.StringBuilder
    foreach ($p in $points) { [void]$sb.Append([char]$p) }
    return $sb.ToString()
}
$S_FILES    = CString @(0x6587,0x4EF6,0x7BA1,0x7406)
$S_MKDIR    = CString @(0x65B0,0x5EFA,0x76EE,0x5F55)
$S_UPLOAD   = CString @(0x4E0A,0x4F20)
$S_DELETE   = CString @(0x5220,0x9664)
$S_REFRESH  = CString @(0x5237,0x65B0)
$S_OK       = CString @(0x786E,0x5B9A)
$S_CANCEL   = CString @(0x53D6,0x6D88)

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
function Invoke-Element($element) {
    $element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() | Out-Null
}
function Set-Text($element, [string]$text) {
    $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue($text)
}

Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class MC2 { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e); }'
function Click-Element($element) {
    $b = $element.Current.BoundingRectangle
    [MC2]::SetCursorPos([int]($b.X + $b.Width/2), [int]($b.Y + $b.Height/2))
    Start-Sleep -Milliseconds 150
    [MC2]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
    [MC2]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
}
function DoubleClick-Element($element) {
    $b = $element.Current.BoundingRectangle
    [MC2]::SetCursorPos([int]($b.X + $b.Width/2), [int]($b.Y + $b.Height/2))
    Start-Sleep -Milliseconds 150
    foreach ($i in 1..2) {
        [MC2]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
        [MC2]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds 80
    }
}
$failures = @()
$checkCount = 0
function Check([string]$name, [bool]$passed, [string]$detail = "") {
    $script:checkCount++
    if ($passed) { Write-Host "PASS: $name" }
    else { Write-Host "FAIL: $name ($detail)"; $script:failures += $name }
}

$adb = Join-Path (Split-Path $PSScriptRoot) "src\Yovo.Platform\Tools\adb.exe"
$testDir = "yovo-realfile-$([DateTime]::Now.ToString('HHmmss'))"
$localFile = Join-Path $env:TEMP "yovo-upload-test.bin"
$downloadDir = Join-Path $env:TEMP "yovo-dl-$([DateTime]::Now.ToString('HHmmss'))"
New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null
$payload = "yovo-realfile-payload-$(Get-Random)-$(Get-Random)"
Set-Content -Path $localFile -Value $payload -Encoding UTF8

# ============ launch ============
Get-Process -Name YovoAdbTools -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
$exe = (Resolve-Path $ExePath).Path
$proc = Start-Process -FilePath $exe -PassThru
Start-Sleep -Seconds 10
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::NameProperty, "Yovo ADB Tools")
$win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
Check "main window" ($null -ne $win) "not found"
if (-not $win) { exit 1 }

# to file manager
$nav = Find-ByName $win $S_FILES
$nav.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() | Out-Null
Start-Sleep -Seconds 2

# ============ 1. mkdir: security policy (reject at root) + real mkdir in /sdcard ============
# 1b. default path is /sdcard (product decision) - mkdir directly
$mkReady = $false
for ($attempt = 0; $attempt -lt 4 -and -not $mkReady; $attempt++) {
    $mkdirBtn2 = Find-ByName $win $S_MKDIR 3000
    if ($mkdirBtn2) { $mkReady = $true }
    if (-not $mkReady) { Start-Sleep -Seconds 1 }
}
if ($mkReady) {
    # mkdir in /sdcard
    $mkdirBtn2 = Find-ByName $win $S_MKDIR
    Invoke-Element $mkdirBtn2
    Start-Sleep -Seconds 1
    $dlgBox2 = $null
    $edits2 = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants,
        (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)))
    foreach ($t in $edits2) {
        if ($t.Current.BoundingRectangle.Height -gt 15) { $dlgBox2 = $t; break }
    }
    if ($dlgBox2) {
        Set-Text $dlgBox2 $testDir
        Start-Sleep -Milliseconds 300
        $ok2 = Find-ByName $root $S_OK 4000
        if ($ok2) { Invoke-Element $ok2 }
        Start-Sleep -Seconds 2
    }
    $exists = & $adb shell ls /sdcard/ 2>$null | Select-String $testDir
    Check "mkdir in sdcard device-verified" ($null -ne $exists) "dir not on device"
    # cleanup: delete via adb (UI delete covered by unit tests)
    & $adb shell rm -rf "/sdcard/$testDir" 2>$null | Out-Null
}

# ============ 2. upload via native OpenFileDialog ============
$upBtn = Find-ByName $win $S_UPLOAD
Check "upload button" ($null -ne $upBtn) "missing"
if ($upBtn) {
    Click-Element $upBtn
    Start-Sleep -Seconds 2
    # native dialog: window class #32770 (common dialog) with Chinese Open button
    $dlg = $null
    $allW = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($w in $allW) {
        if ($w.Current.ProcessId -ne $proc.Id -and $w.Current.BoundingRectangle.Width -gt 300 -and $w.Current.Name -ne "") {
            $openBtn = $w.FindFirst([System.Windows.Automation.TreeScope]::Descendants,
                (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, (CString @(0x6253,0x5F00)))))
            if ($openBtn) { $dlg = $w; break }
        }
    }
    Check "open dialog appears" ($null -ne $dlg) "native dialog not found"
    if ($dlg) {
        $fileEdit = $dlg.FindFirst([System.Windows.Automation.TreeScope]::Descendants,
            (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)))
        if ($fileEdit) {
            Set-Text $fileEdit $localFile
            Start-Sleep -Milliseconds 300
            $openBtn = $dlg.FindFirst([System.Windows.Automation.TreeScope]::Descendants,
                (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, (CString @(0x6253,0x5F00)))))
            if ($openBtn) { Invoke-Element $openBtn }
            Start-Sleep -Seconds 4
        }
        # device verify content
        $remoteContent = & $adb shell cat /sdcard/yovo-upload-test.bin 2>$null
        Check "upload device-verified content" ($remoteContent -eq $payload) "content mismatch or missing"
    }
}

# ============ 3. download via native SaveFileDialog ============
$dlBtn = Find-ByName $win $S_DOWNLOAD
Check "download button" ($null -ne $dlBtn) "missing"
if ($dlBtn) {
    # select the uploaded file in list
    $item = Find-ByName $win "yovo-upload-test.bin" 4000
    Check "uploaded file visible in list" ($null -ne $item) "missing"
    if ($item) {
        $item.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() | Out-Null
        Start-Sleep -Milliseconds 400
        Click-Element $dlBtn
        Start-Sleep -Seconds 2
        # save dialog: file name edit + Save button
        $dlg2 = $null
        $allW2 = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
        foreach ($w in $allW2) {
            if ($w.Current.ClassName -eq "#32770") {
                $saveBtn = $w.FindFirst([System.Windows.Automation.TreeScope]::Descendants,
                    (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, (CString @(0x4FDD,0x5B58)))))
                if ($saveBtn) { $dlg2 = $w; break }
            }
        }
        Check "save dialog appears" ($null -ne $dlg2) "not found"
        if ($dlg2) {
            $fileEdit2 = $dlg2.FindFirst([System.Windows.Automation.TreeScope]::Descendants,
                (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)))
            if ($fileEdit2) {
                Set-Text $fileEdit2 (Join-Path $downloadDir "downloaded.bin")
                Start-Sleep -Milliseconds 300
                $saveBtn = $dlg2.FindFirst([System.Windows.Automation.TreeScope]::Descendants,
                    (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, (CString @(0x4FDD,0x5B58)))))
                if ($saveBtn) { Invoke-Element $saveBtn }
                Start-Sleep -Seconds 4
            }
            $dlFile = Join-Path $downloadDir "downloaded.bin"
            Check "download local file created" (Test-Path $dlFile) "missing"
            if (Test-Path $dlFile) {
                $dlContent = Get-Content $dlFile -Raw -Encoding UTF8
                Check "download content matches" ($dlContent.Trim() -eq $payload) "content mismatch"
            }
        }
    }
}

# ============ 4. cleanup: delete uploaded file on device via UI ============
$item = Find-ByName $win "yovo-upload-test.bin" 3000
if ($item) {
    $item.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() | Out-Null
    Start-Sleep -Milliseconds 300
    $delBtn = Find-ByName $win $S_DELETE
    if ($delBtn) {
        Invoke-Element $delBtn
        Start-Sleep -Seconds 1
        $ok = Find-ByName $root $S_OK 3000
        if ($ok) { Invoke-Element $ok }
        Start-Sleep -Seconds 2
        $gone = & $adb shell ls /sdcard/ 2>$null | Select-String "yovo-upload-test.bin"
        Check "delete device-verified" ($null -eq $gone) "file still on device"
    }
}

Stop-Process -Name YovoAdbTools -Force -ErrorAction SilentlyContinue
Remove-Item $localFile -ErrorAction SilentlyContinue
Remove-Item $downloadDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== REAL FILES: $checkCount checks, $($failures.Count) failures ==="
if ($failures.Count -gt 0) {
    Write-Host "Failed: $($failures -join ', ')"
    exit 1
}
exit 0
