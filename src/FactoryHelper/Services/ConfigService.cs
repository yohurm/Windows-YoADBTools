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
            new AdbCommand { Name = "获取设备型号", Category = "系统信息", Command = "shell getprop ro.product.model" },
            new AdbCommand { Name = "获取 Android 版本", Category = "系统信息", Command = "shell getprop ro.build.version.release" },
            new AdbCommand { Name = "获取序列号", Category = "系统信息", Command = "get-serialno" },
            new AdbCommand { Name = "获取设备状态", Category = "系统信息", Command = "get-state" },
            new AdbCommand { Name = "获取电池信息", Category = "系统信息", Command = "shell dumpsys battery" },
            new AdbCommand { Name = "获取屏幕分辨率", Category = "系统信息", Command = "shell wm size" },
            new AdbCommand { Name = "获取屏幕密度", Category = "系统信息", Command = "shell wm density" },
            new AdbCommand { Name = "获取 CPU 信息", Category = "系统信息", Command = "shell cat /proc/cpuinfo" },
            new AdbCommand { Name = "获取内存信息", Category = "系统信息", Command = "shell cat /proc/meminfo" },
            new AdbCommand { Name = "获取已安装应用", Category = "系统信息", Command = "shell pm list packages" },
            new AdbCommand { Name = "重启设备", Category = "设备控制", Command = "reboot", TimeoutMs = 60000 },
            new AdbCommand { Name = "重启到 Recovery", Category = "设备控制", Command = "reboot recovery", TimeoutMs = 60000 },
            new AdbCommand { Name = "重启到 Bootloader", Category = "设备控制", Command = "reboot bootloader", TimeoutMs = 60000 },
            new AdbCommand { Name = "屏幕截图", Category = "设备控制", Command = "shell \"screencap -p /sdcard/screenshot.png\"" },
            new AdbCommand { Name = "获取当前 Activity", Category = "调试", Command = "shell dumpsys window | findstr mCurrentFocus" },
            new AdbCommand { Name = "查看日志(最近100行)", Category = "调试", Command = "logcat -t 100" },
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
            }
        ];
    }
}