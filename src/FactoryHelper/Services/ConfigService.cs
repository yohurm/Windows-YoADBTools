using System.IO;
using System.Text.Json;
using FactoryHelper.Models;

namespace FactoryHelper.Services;

/// <summary>
/// 配置管理服务 — 加载/保存命令库、命令组等 JSON 配置
/// </summary>
public class ConfigService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    private readonly string _configDir;

    public ConfigService()
    {
        _configDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Config");
        if (!Directory.Exists(_configDir))
            Directory.CreateDirectory(_configDir);
    }

    /// <summary>
    /// 加载单条命令列表
    /// </summary>
    public async Task<List<AdbCommand>> LoadCommandsAsync()
    {
        var path = Path.Combine(_configDir, "commands.json");
        if (!File.Exists(path))
            return GetDefaultCommands();

        try
        {
            var json = await File.ReadAllTextAsync(path);
            return JsonSerializer.Deserialize<List<AdbCommand>>(json, JsonOptions) ?? GetDefaultCommands();
        }
        catch
        {
            return GetDefaultCommands();
        }
    }

    /// <summary>
    /// 保存单条命令列表
    /// </summary>
    public async Task SaveCommandsAsync(List<AdbCommand> commands)
    {
        var path = Path.Combine(_configDir, "commands.json");
        var json = JsonSerializer.Serialize(commands, JsonOptions);
        await File.WriteAllTextAsync(path, json);
    }

    /// <summary>
    /// 加载命令组列表
    /// </summary>
    public async Task<List<CommandGroup>> LoadCommandGroupsAsync()
    {
        var path = Path.Combine(_configDir, "groups.json");
        if (!File.Exists(path))
            return GetDefaultGroups();

        try
        {
            var json = await File.ReadAllTextAsync(path);
            return JsonSerializer.Deserialize<List<CommandGroup>>(json, JsonOptions) ?? GetDefaultGroups();
        }
        catch
        {
            return GetDefaultGroups();
        }
    }

    /// <summary>
    /// 保存命令组列表
    /// </summary>
    public async Task SaveCommandGroupsAsync(List<CommandGroup> groups)
    {
        var path = Path.Combine(_configDir, "groups.json");
        var json = JsonSerializer.Serialize(groups, JsonOptions);
        await File.WriteAllTextAsync(path, json);
    }

    /// <summary>
    /// 默认单条命令（示例）
    /// </summary>
    private static List<AdbCommand> GetDefaultCommands()
    {
        return
        [
            new AdbCommand { Name = "获取设备型号", Category = "通用", Command = "shell getprop ro.product.model" },
            new AdbCommand { Name = "获取 Android 版本", Category = "通用", Command = "shell getprop ro.build.version.release" },
            new AdbCommand { Name = "获取序列号", Category = "通用", Command = "get-serialno" },
            new AdbCommand { Name = "获取设备状态", Category = "通用", Command = "get-state" },
            new AdbCommand { Name = "获取电池信息", Category = "通用", Command = "shell dumpsys battery" },
            new AdbCommand { Name = "获取屏幕分辨率", Category = "通用", Command = "shell wm size" },
            new AdbCommand { Name = "获取屏幕密度", Category = "通用", Command = "shell wm density" },
            new AdbCommand { Name = "获取 CPU 信息", Category = "通用", Command = "shell cat /proc/cpuinfo" },
            new AdbCommand { Name = "获取内存信息", Category = "通用", Command = "shell cat /proc/meminfo" },
            new AdbCommand { Name = "获取已安装应用", Category = "通用", Command = "shell pm list packages" },
            new AdbCommand { Name = "重启设备", Category = "通用", Command = "reboot", TimeoutMs = 60000 },
            new AdbCommand { Name = "重启到 Recovery", Category = "通用", Command = "reboot recovery", TimeoutMs = 60000 },
            new AdbCommand { Name = "重启到 Bootloader", Category = "通用", Command = "reboot bootloader", TimeoutMs = 60000 },
            new AdbCommand { Name = "屏幕截图", Category = "通用", Command = "shell \"screencap -p /sdcard/screenshot.png\"" },
            new AdbCommand { Name = "获取当前 Activity", Category = "通用", Command = "shell dumpsys window | findstr mCurrentFocus" },
            new AdbCommand { Name = "查看日志(最近100行)", Category = "通用", Command = "logcat -t 100" },

            // ===== Nori 产测专用命令 =====
            new AdbCommand { Name = "恢复出厂设置(重启)", Category = "Nori产测", Command = "shell bdft set -recovery", TimeoutMs = 120000, Description = "进入 recovery 恢复出厂设置，设备会重启，请谨慎操作" },
            new AdbCommand { Name = "进入产测模式 TestMode", Category = "Nori产测", Command = "shell bdft write -testmode B", TimeoutMs = 60000 },
            new AdbCommand { Name = "进入 USER 模式", Category = "Nori产测", Command = "shell bdft write -testmode N", TimeoutMs = 60000 },
            new AdbCommand { Name = "重启", Category = "Nori产测", Command = "reboot", TimeoutMs = 60000 },
            new AdbCommand { Name = "检测当前模式", Category = "Nori产测", Command = "shell bdft read -testmode" },
            new AdbCommand { Name = "写号[PCBID]", Category = "Nori产测", Command = "shell bdft write -pcbasn {0}", InputPrompts = ["请输入 PCBID"], TimeoutMs = 60000 },
            new AdbCommand { Name = "读号[PCBID]", Category = "Nori产测", Command = "shell bdft read -pcbasn" },
            new AdbCommand { Name = "写号[SN]", Category = "Nori产测", Command = "shell bdft write -sn {0}", InputPrompts = ["请输入 SN"], TimeoutMs = 60000 },
            new AdbCommand { Name = "读号[SN]", Category = "Nori产测", Command = "shell bdft read -sn" },
            new AdbCommand { Name = "读软件 HWver", Category = "Nori产测", Command = "shell bdft read -hwver" },
            new AdbCommand { Name = "写其他信息", Category = "Nori产测", Command = "shell bdft write -extra {0} {1}", InputPrompts = ["请输入 key", "请输入 value"], TimeoutMs = 60000 },
            new AdbCommand { Name = "读取其他信息", Category = "Nori产测", Command = "shell bdft read -extra {0}", InputPrompts = ["请输入 key"] },
            new AdbCommand { Name = "WiFi MAC 读取", Category = "Nori产测", Command = "shell bdft read -wfmac" },
            new AdbCommand { Name = "BT MAC 读取", Category = "Nori产测", Command = "shell bdft read -btmac" },
            new AdbCommand { Name = "基础信息校验 Nand", Category = "Nori产测", Command = "shell bdft get -emmc" },
            new AdbCommand { Name = "基础信息校验 DDR", Category = "Nori产测", Command = "shell bdft get -ddr" },
            new AdbCommand { Name = "软件版本号读取(Check ROM Version)", Category = "Nori产测", Command = "shell bdft get -swv" },
        ];
    }

    /// <summary>
    /// 默认命令组（示例）
    /// </summary>
    private static List<CommandGroup> GetDefaultGroups()
    {
        return
        [
            new CommandGroup
            {
                Name = "设备信息采集",
                Description = "获取设备的完整系统信息",
                Steps =
                [
                    new GroupStep { Command = "shell getprop ro.product.model", Description = "获取型号" },
                    new GroupStep { Command = "shell getprop ro.build.version.release", Description = "获取Android版本" },
                    new GroupStep { Command = "get-serialno", Description = "获取序列号" },
                    new GroupStep { Command = "shell wm size", Description = "获取分辨率" },
                    new GroupStep { Command = "shell dumpsys battery", Description = "获取电池信息", DelayAfterMs = 500 },
                ]
            },
            new CommandGroup
            {
                Name = "重启并等待恢复",
                Description = "重启设备后等待设备重新上线",
                Steps =
                [
                    new GroupStep { Command = "reboot", Description = "重启设备", TimeoutMs = 60000, DelayAfterMs = 30000 },
                    new GroupStep { Command = "wait-for-device", Description = "等待设备上线", TimeoutMs = 120000, DelayAfterMs = 5000 },
                    new GroupStep { Command = "shell getprop sys.boot_completed", Description = "检查启动完成" },
                ]
            },
            new CommandGroup
            {
                Name = "写入SN",
                Description = "Nori 产测流程: 检查设备 → 进入产测模式 → 写入SN → 查询SN",
                Steps =
                [
                    new GroupStep { Command = "get-state", Description = "1.检查设备", TimeoutMs = 10000 },
                    new GroupStep { Command = "shell bdft write -testmode B", Description = "2.进入产测模式", TimeoutMs = 60000, DelayAfterMs = 1000 },
                    new GroupStep { Command = "shell bdft write -sn {0}", Description = "3.写入SN", TimeoutMs = 60000, InputPrompts = ["请输入 SN"] },
                    new GroupStep { Command = "shell bdft read -sn", Description = "4.查询SN", TimeoutMs = 30000 },
                ]
            }
        ];
    }
}