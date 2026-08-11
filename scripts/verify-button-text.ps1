# Pixel-level button text check: activate target window, capture, scan each button's
# text pixel extent vs button bounds. Pure ASCII (PS 5.1 encoding).
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type -Name DPI -Namespace Native -MemberDefinition @"
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr dpi);
"@
# unify coordinate systems: physical pixels for UIA + GDI (PS defaults to DPI-virtualized)
try { [Native.DPI]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null } catch { }
Add-Type -Name WN -Namespace Native -MemberDefinition @"
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern int GetWindowTextW(IntPtr h, System.Text.StringBuilder sb, int max);
    public delegate bool EnumWindowsProc(IntPtr h, IntPtr lp);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
"@

$proc = Get-Process FactoryHelper -ErrorAction SilentlyContinue
if (-not $proc) { Write-Output "FAIL: app not running"; exit 1 }
$pid0 = $proc.Id
$mainHwnd = $proc.MainWindowHandle

# find target window by physical size (DPI-aware): main 1200x740 or manager 920x660
$mainRc = ([System.Windows.Automation.AutomationElement]::FromHandle($mainHwnd)).Current.BoundingRectangle
$scale = $mainRc.Width / 1200.0
$targetW = [int](920 * $scale); $targetH = [int](660 * $scale)
$targetHwnd = [IntPtr]::Zero
$targetSize = "920x660 (manager)"
$cb = [Native.WN+EnumWindowsProc]{
    param($h, $lp)
    $wp = [uint32]0
    [Native.WN]::GetWindowThreadProcessId($h, [ref]$wp) | Out-Null
    if ($wp -eq $pid0 -and [Native.WN]::IsWindowVisible($h)) {
        $el = [System.Windows.Automation.AutomationElement]::FromHandle($h)
        $r = $el.Current.BoundingRectangle
        $ww = [int]$r.Width; $wh = [int]$r.Height
        if ($ww -eq $targetW -and $wh -eq $targetH) { $script:targetHwnd = $h }
    }
    return $true
}
[Native.WN]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null

if ($targetHwnd -eq [IntPtr]::Zero) {
    $targetHwnd = $mainHwnd
    $targetSize = "1200x740 (main)"
}

# activate and capture
[Native.WN]::SetForegroundWindow($targetHwnd) | Out-Null
Start-Sleep -Milliseconds 500

# use UIA window rect (physical pixels) as coordinate base for both capture and buttons
$mgrEl = [System.Windows.Automation.AutomationElement]::FromHandle($targetHwnd)
$winRc = $mgrEl.Current.BoundingRectangle
$w = [int]$winRc.Width; $h = [int]$winRc.Height
Write-Output "Target window: $w x $h ($targetSize)"

$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen([int]$winRc.X, [int]$winRc.Y, 0, 0, $bmp.Size)
$btnCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
$btns = $mgrEl.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond)

Write-Output "=== Button text extent check ==="
foreach ($b in $btns) {
    $n = $b.Current.Name
    if ($n.Length -eq 0) { continue }
    $r = $b.Current.BoundingRectangle
    $bx = [int]($r.X - $winRc.X); $by = [int]($r.Y - $winRc.Y)
    $bw = [int]$r.Width; $bh = [int]$r.Height
    if ($bx -lt 0 -or $by -lt 0 -or $bx + $bw -gt $w -or $by + $bh -gt $h) {
        Write-Output ("  [$n] OUTSIDE window bounds: rect=($bx,$by $bw x $bh)")
        continue
    }
    # scan dark pixels (text) in button area, find min/max x and y
    $minTx = 99999; $maxTx = -1; $minTy = 99999; $maxTy = -1
    for ($y = $by + 3; $y -lt $by + $bh - 3; $y += 2) {
        for ($x = $bx + 3; $x -lt $bx + $bw - 3; $x += 2) {
            $c = $bmp.GetPixel($x, $y)
            if (($c.R + $c.G + $c.B) -lt 360) {  # dark = text
                if ($x -lt $minTx) { $minTx = $x }
                if ($x -gt $maxTx) { $maxTx = $x }
                if ($y -lt $minTy) { $minTy = $y }
                if ($y -gt $maxTy) { $maxTy = $y }
            }
        }
    }
    $lGap = $minTx - $bx; $rGap = ($bx + $bw) - $maxTx
    $tGap = $minTy - $by; $bGap = ($by + $bh) - $maxTy
    $mark = ""
    if ($rGap -lt 4 -or $lGap -lt 4) { $mark = " <== TEXT TIGHT/CLIPPED (leftGap=$lGap rightGap=$rGap)" }
    if ($maxTx -lt 0) { $mark = " (no text pixels found)" }
    Write-Output ("  [$n] bw=$bw textX=$minTx..$maxTx gaps L=$lGap R=$rGap T=$tGap B=$bGap$mark")
}
$g.Dispose(); $bmp.Dispose()
