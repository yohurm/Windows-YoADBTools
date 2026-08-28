# Yohu ADB Tools v6 — 全功能联调（需设备在线；真机桌面会话运行）
# 用法（应用需关闭）：
#   powershell -ExecutionPolicy Bypass -File scripts/verify-v6-full.ps1
# 覆盖：启动 / 设备扫描 / 终端（库加载/执行/命令管理）/ 文件（浏览/传输/删除）/
#       日志（多会话/过滤/导出）/ 设置 / 占位模块；退出后检查 crash 日志。

param(
    [string]$Exe = (Join-Path $PSScriptRoot "..\target\release\YohuAdbTools.exe")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Exe)) {
    throw "未找到 $Exe — 请先 cargo tauri build --no-bundle（在 app/yohu-app 下）"
}

# 共享库：数据目录名（= PRODUCT_NAME / DATA_DIR_NAME）单源
. (Join-Path $PSScriptRoot "verify-lib.ps1")

$logsDir = Join-Path (Join-Path $env:LOCALAPPDATA $ProductDataDir) "logs"
Remove-Item (Join-Path $logsDir "panic-*.log") -ErrorAction SilentlyContinue

Write-Host "== Yohu ADB Tools v6 全功能联调 =="
Write-Host "请确保至少 1 台设备 USB 连接且已授权（adb devices 显示 device）。"
Write-Host ""

$steps = @(
    @{ Name = "启动与设备"; Check = "应用启动；左侧设备栏出现设备卡片（绿点在线 + 型号/串号）；状态栏显示在线数" },
    @{ Name = "设置"; Check = "导航到「设置」；分组卡片带生效徽章（立即/重启/下次采集）；修改 ADB 路径留空并保存（toast 提示已保存）；密度切换立即生效" },
    @{ Name = "终端-库"; Check = "「ADB 命令终端」：左侧命令库树显示默认库（组节点带命令数徽章；命令节点悬停显示模板）" },
    @{ Name = "终端-执行"; Check = "选中「型号」点执行 → 结果卡片（命令名 + 通过徽章 + 用时），输出可折叠；选中「查询属性」→ 弹输入框 → 填 ro.product.model → 通过（输出默认展开）" },
    @{ Name = "终端-组"; Check = "选中「设备信息」组点执行 → 3 条命令逐条出结果卡片；多设备时按设备分组（组头汇总徽章）；状态栏任务出现又消失" },
    @{ Name = "终端-管理"; Check = "命令管理：改命令名 → 保存 → 树刷新；再打开改坏正则 → 保存 → 报错且不落盘；取消 → 原库不变" },
    @{ Name = "文件-浏览"; Check = "「文件管理」：面包屑路径栏（/ ▸ sdcard 逐级可点）；双栏：目录（点击下钻）| 文件（名称/大小/修改时间等宽对齐）" },
    @{ Name = "文件-传输"; Check = "上传一个小文件 → 传输卡片（方向图标 + 进度 + 速度）→ 完成徽章 3s 后淡出；下载/新建目录/删除确认框均生效" },
    @{ Name = "日志-采集"; Check = "「日志分析」：点开始 → 状态行采集指示绿点 + 缓冲行数增长；列表滚动出现 logcat 行（级别着色 + 3px 级别左条；点击行选中高亮）" },
    @{ Name = "日志-过滤"; Check = "级别选 W → 列表只剩 W/E/F；Tag 填 ActivityManager → 进一步过滤；关键字高亮命中且检索框 accent 边框" },
    @{ Name = "日志-多会话"; Check = "Ctrl+T 新建按包名会话（选 com.android.systemui）→ 新 Tab 仅该包 PID 行；Tab 右键：重命名/复制会话/关闭其他生效；Ctrl+Tab 切换；Ctrl+W 关闭" },
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
$appProcesses = @(Get-Process -Name "yohu-app" -ErrorAction SilentlyContinue)
foreach ($p in $appProcesses) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

$panics = @(Get-ChildItem $logsDir -Filter "panic-*.log" -ErrorAction SilentlyContinue)

Write-Host "== 结果 =="
if ($failures.Count -eq 0 -and $panics.Count -eq 0) {
    Write-Host "v6 全功能联调全绿 （$($steps.Count) 项检查通过，无 crash 日志）"
} else {
    if ($failures.Count -gt 0) {
        Write-Host "未通过项：$($failures -join '、')"
    }
    if ($panics.Count -gt 0) {
        Write-Host "crash 日志：$($panics.Name -join '、')"
    }
    exit 1
}
