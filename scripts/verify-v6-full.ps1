# Yovo ADB Tools v6 — 全功能联调（需设备在线；真机桌面会话运行）
# 用法（应用需关闭）：
#   powershell -ExecutionPolicy Bypass -File scripts/verify-v6-full.ps1
# 覆盖：启动 / 设备扫描 / 终端（库加载/执行/命令管理）/ 文件（浏览/传输/删除）/
#       日志（多会话/过滤/导出）/ 设置 / 占位模块；退出后检查 crash 日志。

param(
    [string]$Exe = (Join-Path $PSScriptRoot "..\target\release\yovo-app.exe")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Exe)) {
    throw "未找到 $Exe — 请先 cargo build --release -p yovo-app"
}

$logsDir = Join-Path $env:LOCALAPPDATA "YovoAdbTools\logs"
Remove-Item (Join-Path $logsDir "panic-*.log") -ErrorAction SilentlyContinue

Write-Host "== Yovo ADB Tools v6 全功能联调 =="
Write-Host "请确保至少 1 台设备 USB 连接且已授权（adb devices 显示 device）。"
Write-Host ""

$steps = @(
    @{ Name = "启动与设备"; Check = "应用启动；左侧设备栏出现设备（绿点在线）；状态栏显示在线数" },
    @{ Name = "设置"; Check = "导航到「设置」；修改 ADB 路径留空并保存（提示已保存）" },
    @{ Name = "终端-库"; Check = "「ADB 命令终端」：左侧命令库树显示默认库（设备信息/电源/连接性）" },
    @{ Name = "终端-执行"; Check = "选中「型号」点执行 → 结果区出现每设备一条结果，徽章=通过；选中「查询属性」→ 弹输入框 → 填 ro.product.model → 通过" },
    @{ Name = "终端-组"; Check = "选中「设备信息」组点执行 → 3 条命令逐条出结果；状态栏任务出现又消失" },
    @{ Name = "终端-管理"; Check = "命令管理：改命令名 → 保存 → 树刷新；再打开改坏正则 → 保存 → 报错且不落盘；取消 → 原库不变" },
    @{ Name = "文件-浏览"; Check = "「文件管理」：/sdcard 列表出现（目录在前）；双击进入 DCIM；上级目录按钮返回" },
    @{ Name = "文件-传输"; Check = "上传一个小文件 → 传输面板出现进度 → 完成徽章；选中文件下载到本地 → 完成；新建目录出现；删除有确认框且生效" },
    @{ Name = "日志-采集"; Check = "「日志分析」：点开始 → 状态栏缓冲行数增长；列表滚动出现 logcat 行（级别着色）" },
    @{ Name = "日志-过滤"; Check = "级别选 W → 列表只剩 W/E/F；Tag 填 ActivityManager → 进一步过滤；关键字高亮命中" },
    @{ Name = "日志-多会话"; Check = "Ctrl+T 新建按包名会话（选 com.android.systemui）→ 新 Tab 仅该包 PID 行；Ctrl+Tab 切换；Ctrl+W 关闭" },
    @{ Name = "日志-导出"; Check = "导出 → 提示路径 → 用资源管理器打开 txt 内容与过滤一致" },
    @{ Name = "日志-停止"; Check = "点停止 → 采集停止、缓冲保留可继续过滤" },
    @{ Name = "占位"; Check = "「投屏显示」显示开发中页" }
)

$failures = @()
foreach ($step in $steps) {
    $answer = Read-Host "检查「$($step.Name)」：$($step.Check) [y/N]"
    if ($answer -notmatch '^y') {
        $failures += $step.Name
    }
}

Write-Host ""
$appProcesses = @(Get-Process -Name "yovo-app" -ErrorAction SilentlyContinue)
foreach ($p in $appProcesses) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

$panics = @(Get-ChildItem $logsDir -Filter "panic-*.log" -ErrorAction SilentlyContinue)

Write-Host "== 结果 =="
if ($failures.Count -eq 0 -and $panics.Count -eq 0) {
    Write-Host "v6 全功能联调全绿 ✅（$($steps.Count) 项检查通过，无 crash 日志）"
} else {
    if ($failures.Count -gt 0) {
        Write-Host "未通过项：$($failures -join '、')"
    }
    if ($panics.Count -gt 0) {
        Write-Host "crash 日志：$($panics.Name -join '、')"
    }
    exit 1
}
