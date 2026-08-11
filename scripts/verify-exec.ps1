# End-to-end execution verification: select device -> select command -> click execute
# NOTE: keep this file pure ASCII - PowerShell 5.1 decodes BOM-less files as ANSI/GBK,
# and UTF-8 Chinese bytes corrupt line parsing (verified the hard way).
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes

$p = Get-Process FactoryHelper
$win = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
if (-not $win) { Write-Output "WINDOW NOT FOUND"; exit 1 }
Write-Output ("Window: " + $win.Current.Name)

$itemCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::ListItem)
$items = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $itemCond)

# 1) Select the connected device item (match its serial/model)
$deviceItem = $null
foreach ($it in $items) {
    if ($it.Current.Name -match 'V2361A|10CF8J') { $deviceItem = $it; break }
}
if (-not $deviceItem) { Write-Output "DEVICE ITEM NOT FOUND"; exit 1 }
Write-Output ("Device item: " + $deviceItem.Current.Name)
$sel = $deviceItem.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
$sel.Select()
Start-Sleep -Milliseconds 500

# 2) Select the first command in the command list (first CommandDefinition type item)
$cmdItem = $null
foreach ($it in $items) {
    if ($it.Current.Name -like 'FactoryHelper.Modules.AdbTerminal.Models.CommandDefinition*') {
        $cmdItem = $it; break
    }
}
if (-not $cmdItem) { Write-Output "COMMAND ITEM NOT FOUND"; exit 1 }
Write-Output "Command item selected: first CommandDefinition"
$sel2 = $cmdItem.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
$sel2.Select()
Start-Sleep -Milliseconds 500

# 3) Click the execute button (name = codepoints U+6267 U+884C U+547D U+4EE4)
$execName = -join [char[]]@(0x6267, 0x884C, 0x547D, 0x4EE4)
$btnCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
$btns = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond)
$execBtn = $null
foreach ($b in $btns) {
    if ($b.Current.Name -eq $execName) { $execBtn = $b; break }
}
if (-not $execBtn) { Write-Output "EXEC BUTTON NOT FOUND"; exit 1 }
$invoke = $execBtn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
$invoke.Invoke()
Write-Output "Exec invoked OK"
