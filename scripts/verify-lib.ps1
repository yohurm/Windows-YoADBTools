# Yohu ADB Tools v6 — verify 脚本共享库（数据目录常量 + settings.json 单源生成）
# 供 scripts/verify-v6-*.ps1 用 dot-source（. .\scripts\verify-lib.ps1）复用。
# 只重构、不引入 Rust 读取；脚本之间的“单一来源”即本文件。
#
# 契约来源（改动时同步更新，避免失真）：
#   - 数据目录名  ：core/yohu-protocol/src/identity.rs 的 `PRODUCT_NAME` / `DATA_DIR_NAME`（= "YohuAdbTools"）
#   - settings 键 ：core/yohu-protocol/src/settings.rs 的 `AppSettings` 字段与 `SettingKey::as_str()`
#   - settings 根 ：`%LOCALAPPDATA%\<DATA_DIR_NAME>\settings\`（app/yohu-adbtools/src/paths.rs；不随 data_root 迁移）

# 产品数据目录名（= PRODUCT_NAME = DATA_DIR_NAME）。身份/目录变更时只改这里。
$ProductDataDir = "YohuAdbTools"

# fake-adb 数据目录（verify-v6-e2e.ps1 专用：脚本化假 adb 的独立目录，零共享状态）。
$FakeDeviceDataDir = "YohuFakeDevice"

# 统一写法：`Join-Path $env:LOCALAPPDATA $ProductDataDir` 得到产品数据根目录。
# 各脚本以它为基础再拼子路径，例如：
#   设置目录   -> Join-Path (Join-Path $env:LOCALAPPDATA $ProductDataDir) "settings"
#   日志目录   -> Join-Path (Join-Path $env:LOCALAPPDATA $ProductDataDir) "logs"

function Write-AppSettings {
    <#
    .SYNOPSIS
        单一来源生成 %LOCALAPPDATA%\<ProductDataDir>\settings\settings.json。
    .DESCRIPTION
        契约：core/yohu-protocol/src/settings.rs 的 AppSettings（字段名与 SettingKey::as_str 一致）。
        这里只写验证脚本关心的键；其余字段（export_*、log_display_columns、mirror_*、
        log_write_mode、export_mode 等）由 AppSettings 的字段级 serde(default) 回落，
        行为与旧硬编码哈希完全一致（settings 契约测试锁死默认值）。
    .PARAMETER AdbPath
        自定义 adb 路径；空 = 自动解析（用户设置 -> 应用旁 -> 内置解压）。
    #>
    param(
        [string]$AdbPath = "",
        [string]$DataRoot = "",
        [int]$DevicesAutoRefresh = 0,
        [int]$BufferCapacity = 50000,
        [bool]$ClearDeviceOnStart = $false,
        [string]$Theme = "light",
        [string]$Density = "compact"
    )

    $settingsDir = Join-Path (Join-Path $env:LOCALAPPDATA $ProductDataDir) "settings"
    New-Item -ItemType Directory -Force $settingsDir | Out-Null

    $options = @{
        adb_path              = $AdbPath
        data_root             = $DataRoot
        devices_auto_refresh  = $DevicesAutoRefresh
        buffer_capacity       = $BufferCapacity
        clear_device_on_start = $ClearDeviceOnStart
        theme                 = $Theme
        density               = $Density
    }

    $options | ConvertTo-Json | Set-Content (Join-Path $settingsDir "settings.json") -Encoding utf8
}
