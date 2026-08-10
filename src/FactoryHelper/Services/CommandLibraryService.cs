using System.IO;
using System.Text.Json;
using FactoryHelper.Models;

namespace FactoryHelper.Services;

/// <summary>
/// 命令仓库 — 单条命令/命令组/标签的唯一数据源。
/// 所有增删改必须走本服务，改完触发 LibraryChanged 事件，界面自动刷新。
/// </summary>
public interface ICommandLibraryService
{
    /// <summary>命令库变更事件（增删改后触发）</summary>
    event Action? LibraryChanged;

    /// <summary>单条命令库（只读访问）</summary>
    IReadOnlyList<CommandDefinition> Commands { get; }

    /// <summary>命令组库（只读访问）</summary>
    IReadOnlyList<CommandGroup> Groups { get; }

    /// <summary>全部标签</summary>
    IReadOnlyList<string> Tags { get; }

    /// <summary>初始化（加载配置）</summary>
    Task InitializeAsync();

    // ===== 单条命令 CRUD =====

    void AddCommand(CommandDefinition cmd);
    void UpdateCommand(CommandDefinition cmd);
    void DeleteCommand(string id);

    // ===== 命令组 CRUD =====

    void AddGroup(CommandGroup group);
    void UpdateGroup(CommandGroup group);
    void DeleteGroup(string id);

    // ===== 标签管理 =====

    void AddTag(string tag);
    void RenameTag(string oldName, string newName);
    void DeleteTag(string tag);

    /// <summary>保存全部配置到磁盘</summary>
    Task SaveAsync();
}

public class CommandLibraryService : ICommandLibraryService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    private readonly string _configDir;

    private readonly List<CommandDefinition> _commands = [];
    private readonly List<CommandGroup> _groups = [];
    private readonly List<string> _tags = [];

    public event Action? LibraryChanged;

    public IReadOnlyList<CommandDefinition> Commands => _commands;
    public IReadOnlyList<CommandGroup> Groups => _groups;
    public IReadOnlyList<string> Tags => _tags;

    public CommandLibraryService()
    {
        _configDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Config");
        Directory.CreateDirectory(_configDir);
    }

    public async Task InitializeAsync()
    {
        // 单条命令
        var commandsPath = Path.Combine(_configDir, "commands.json");
        var commands = await LoadAsync(commandsPath, GetDefaultCommands());
        _commands.Clear();
        _commands.AddRange(commands);

        // 命令组
        var groupsPath = Path.Combine(_configDir, "groups.json");
        var groups = await LoadAsync(groupsPath, GetDefaultGroups());
        _groups.Clear();
        _groups.AddRange(groups);

        // 标签：从命令/命令组分类提取 + 内置标签
        RefreshTags();
        LibraryChanged?.Invoke();
    }

    // ===== 单条命令 CRUD =====

    public void AddCommand(CommandDefinition cmd)
    {
        _commands.Add(cmd);
        RefreshTags();
        LibraryChanged?.Invoke();
    }

    public void UpdateCommand(CommandDefinition cmd)
    {
        var index = _commands.FindIndex(c => c.Id == cmd.Id);
        if (index >= 0)
        {
            _commands[index] = cmd;
            RefreshTags();
            LibraryChanged?.Invoke();
        }
    }

    public void DeleteCommand(string id)
    {
        _commands.RemoveAll(c => c.Id == id);
        RefreshTags();
        LibraryChanged?.Invoke();
    }

    // ===== 命令组 CRUD =====

    public void AddGroup(CommandGroup group)
    {
        _groups.Add(group);
        RefreshTags();
        LibraryChanged?.Invoke();
    }

    public void UpdateGroup(CommandGroup group)
    {
        var index = _groups.FindIndex(g => g.Id == group.Id);
        if (index >= 0)
        {
            _groups[index] = group;
            RefreshTags();
            LibraryChanged?.Invoke();
        }
    }

    public void DeleteGroup(string id)
    {
        _groups.RemoveAll(g => g.Id == id);
        RefreshTags();
        LibraryChanged?.Invoke();
    }

    // ===== 标签管理 =====

    public void AddTag(string tag)
    {
        if (string.IsNullOrWhiteSpace(tag) || _tags.Contains(tag)) return;
        _tags.Add(tag);
        LibraryChanged?.Invoke();
    }

    public void RenameTag(string oldName, string newName)
    {
        if (string.IsNullOrWhiteSpace(newName) || oldName == newName) return;

        foreach (var cmd in _commands.Where(c => c.Category == oldName))
            cmd.Category = newName;
        foreach (var group in _groups.Where(g => g.Category == oldName))
            group.Category = newName;

        RefreshTags();
        LibraryChanged?.Invoke();
    }

    public void DeleteTag(string tag)
    {
        // 仅移除标签定义，命令保留（分类置空）
        _tags.Remove(tag);
        LibraryChanged?.Invoke();
    }

    // ===== 保存 =====

    public async Task SaveAsync()
    {
        await SaveAsync(Path.Combine(_configDir, "commands.json"), _commands);
        await SaveAsync(Path.Combine(_configDir, "groups.json"), _groups);
    }

    // ===== 内部 =====

    /// <summary>从命令/命令组分类重建标签列表</summary>
    private void RefreshTags()
    {
        _tags.Clear();
        var cats = _commands.Select(c => c.Category)
            .Concat(_groups.Select(g => g.Category))
            .Where(c => !string.IsNullOrWhiteSpace(c))
            .Cast<string>()
            .Distinct();
        _tags.AddRange(cats);

        if (!_tags.Contains("通用")) _tags.Insert(0, "通用");
        if (!_tags.Contains("Nori产测")) _tags.Add("Nori产测");
    }

    private static async Task<List<T>> LoadAsync<T>(string path, List<T> defaultValue)
    {
        if (!File.Exists(path))
            return defaultValue;

        try
        {
            var json = await File.ReadAllTextAsync(path);
            return JsonSerializer.Deserialize<List<T>>(json, JsonOptions) ?? defaultValue;
        }
        catch
        {
            return defaultValue; // 损坏配置回退默认
        }
    }

    private static async Task SaveAsync<T>(string path, List<T> data)
    {
        var json = JsonSerializer.Serialize(data, JsonOptions);
        await File.WriteAllTextAsync(path, json);
    }

    // ===== 默认命令库 =====

    /// <summary>bdft 读命令成功正则: 输出 "[key] = [value]"</summary>
    public const string BDFT_READ_REGEX = @"^\[[^\]]*\]\s*=\s*\[[^\]]*\]";

    /// <summary>bdft 写命令成功正则: 空输出(成功无输出) 或 "[key] = [value]"</summary>
    public const string BDFT_WRITE_REGEX = @"^$|^\[[^\]]*\]\s*=\s*\[[^\]]*\]";

    /// <summary>bdft 失败正则: 参数错误或服务失败的错误输出</summary>
    public const string BDFT_FAIL_REGEX = @"args is null or empty|access to the service failed|error|fail";

    private static List<CommandDefinition> GetDefaultCommands()
    {
        return
        [
            new CommandDefinition { Name = "获取设备型号", Category = "通用", Command = "shell getprop ro.product.model" },
            new CommandDefinition { Name = "获取 Android 版本", Category = "通用", Command = "shell getprop ro.build.version.release" },
            new CommandDefinition { Name = "获取序列号", Category = "通用", Command = "get-serialno" },
            new CommandDefinition { Name = "获取设备状态", Category = "通用", Command = "get-state" },
            new CommandDefinition { Name = "获取电池信息", Category = "通用", Command = "shell dumpsys battery" },
            new CommandDefinition { Name = "获取屏幕分辨率", Category = "通用", Command = "shell wm size" },
            new CommandDefinition { Name = "获取屏幕密度", Category = "通用", Command = "shell wm density" },
            new CommandDefinition { Name = "获取 CPU 信息", Category = "通用", Command = "shell cat /proc/cpuinfo" },
            new CommandDefinition { Name = "获取内存信息", Category = "通用", Command = "shell cat /proc/meminfo" },
            new CommandDefinition { Name = "获取已安装应用", Category = "通用", Command = "shell pm list packages" },
            new CommandDefinition { Name = "重启设备", Category = "通用", Command = "reboot", TimeoutMs = 60000 },
            new CommandDefinition { Name = "重启到 Recovery", Category = "通用", Command = "reboot recovery", TimeoutMs = 60000 },
            new CommandDefinition { Name = "重启到 Bootloader", Category = "通用", Command = "reboot bootloader", TimeoutMs = 60000 },
            new CommandDefinition { Name = "屏幕截图", Category = "通用", Command = "shell \"screencap -p /sdcard/screenshot.png\"" },
            new CommandDefinition { Name = "获取当前 Activity", Category = "通用", Command = "shell \"dumpsys window | grep mCurrentFocus\"" },
            new CommandDefinition { Name = "查看日志(最近100行)", Category = "通用", Command = "logcat -t 100" },

            // ===== Nori 专用命令 =====
            // bdft 工具退出码不可靠: 成功也返回 255; 参数错误返回 0 但输出错误信息
            // 判定策略: FailureRegex 优先(匹配即失败) → SuccessRegex(匹配即成功) → 退出码
            new CommandDefinition { Name = "恢复出厂设置(重启)", Category = "Nori产测", Command = "shell bdft set -recovery", TimeoutMs = 120000, Description = "进入 recovery 恢复出厂设置，设备会重启，请谨慎操作", SuccessRegex = BDFT_WRITE_REGEX, FailureRegex = BDFT_FAIL_REGEX },
            new CommandDefinition { Name = "进入产测模式 TestMode", Category = "Nori产测", Command = "shell bdft write -testmode B", TimeoutMs = 60000, SuccessRegex = BDFT_WRITE_REGEX, FailureRegex = BDFT_FAIL_REGEX },
            new CommandDefinition { Name = "进入 USER 模式", Category = "Nori产测", Command = "shell bdft write -testmode N", TimeoutMs = 60000, SuccessRegex = BDFT_WRITE_REGEX, FailureRegex = BDFT_FAIL_REGEX },
            new CommandDefinition { Name = "重启", Category = "Nori产测", Command = "reboot", TimeoutMs = 60000 },
            new CommandDefinition { Name = "检测当前模式", Category = "Nori产测", Command = "shell bdft read -testmode", SuccessRegex = BDFT_READ_REGEX, FailureRegex = BDFT_FAIL_REGEX },
            new CommandDefinition { Name = "写号[PCBID]", Category = "Nori产测", Command = "shell bdft write -pcbasn {0}", InputPrompts = ["请输入 PCBID"], TimeoutMs = 60000, SuccessRegex = BDFT_WRITE_REGEX, FailureRegex = BDFT_FAIL_REGEX },
            new CommandDefinition { Name = "读号[PCBID]", Category = "Nori产测", Command = "shell bdft read -pcbasn", SuccessRegex = BDFT_READ_REGEX, FailureRegex = BDFT_FAIL_REGEX },
            new CommandDefinition { Name = "写号[SN]", Category = "Nori产测", Command = "shell bdft write -sn {0}", InputPrompts = ["请输入 SN"], TimeoutMs = 60000, SuccessRegex = BDFT_WRITE_REGEX, FailureRegex = BDFT_FAIL_REGEX },
            new CommandDefinition { Name = "读号[SN]", Category = "Nori产测", Command = "shell bdft read -sn", SuccessRegex = BDFT_READ_REGEX, FailureRegex = BDFT_FAIL_REGEX },
            new CommandDefinition { Name = "读软件 HWver", Category = "Nori产测", Command = "shell bdft read -hwver", SuccessRegex = BDFT_READ_REGEX, FailureRegex = BDFT_FAIL_REGEX },
            new CommandDefinition { Name = "写其他信息", Category = "Nori产测", Command = "shell bdft write -extra {0} {1}", InputPrompts = ["请输入 key", "请输入 value"], TimeoutMs = 60000, SuccessRegex = BDFT_WRITE_REGEX, FailureRegex = BDFT_FAIL_REGEX },
            new CommandDefinition { Name = "读取其他信息", Category = "Nori产测", Command = "shell bdft read -extra {0}", InputPrompts = ["请输入 key"], SuccessRegex = BDFT_READ_REGEX, FailureRegex = BDFT_FAIL_REGEX },
            new CommandDefinition { Name = "WiFi MAC 读取", Category = "Nori产测", Command = "shell bdft read -wfmac", SuccessRegex = BDFT_READ_REGEX, FailureRegex = BDFT_FAIL_REGEX },
            new CommandDefinition { Name = "BT MAC 读取", Category = "Nori产测", Command = "shell bdft read -btmac", SuccessRegex = BDFT_READ_REGEX, FailureRegex = BDFT_FAIL_REGEX },
            new CommandDefinition { Name = "基础信息校验 Nand", Category = "Nori产测", Command = "shell bdft get -emmc", SuccessRegex = BDFT_READ_REGEX, FailureRegex = BDFT_FAIL_REGEX },
            new CommandDefinition { Name = "基础信息校验 DDR", Category = "Nori产测", Command = "shell bdft get -ddr", SuccessRegex = BDFT_READ_REGEX, FailureRegex = BDFT_FAIL_REGEX },
            new CommandDefinition { Name = "软件版本号读取(Check ROM Version)", Category = "Nori产测", Command = "shell bdft get -swv", SuccessRegex = BDFT_READ_REGEX, FailureRegex = BDFT_FAIL_REGEX },
        ];
    }

    private static List<CommandGroup> GetDefaultGroups()
    {
        return
        [
            new CommandGroup
            {
                Name = "设备信息采集",
                Category = "通用",
                Description = "获取设备的完整系统信息",
                Steps =
                [
                    new CommandDefinition { Name = "获取型号", Command = "shell getprop ro.product.model" },
                    new CommandDefinition { Name = "获取Android版本", Command = "shell getprop ro.build.version.release" },
                    new CommandDefinition { Name = "获取序列号", Command = "get-serialno" },
                    new CommandDefinition { Name = "获取分辨率", Command = "shell wm size" },
                    new CommandDefinition { Name = "获取电池信息", Command = "shell dumpsys battery", DelayAfterMs = 500 },
                ]
            },
            new CommandGroup
            {
                Name = "重启并等待恢复",
                Category = "通用",
                Description = "重启设备后等待设备重新上线",
                Steps =
                [
                    new CommandDefinition { Name = "重启设备", Command = "reboot", TimeoutMs = 60000, DelayAfterMs = 30000 },
                    new CommandDefinition { Name = "等待设备上线", Command = "wait-for-device", TimeoutMs = 120000, DelayAfterMs = 5000 },
                    new CommandDefinition { Name = "检查启动完成", Command = "shell getprop sys.boot_completed" },
                ]
            },
            new CommandGroup
            {
                Name = "写入SN",
                Category = "Nori产测",
                Description = "Nori 产测流程: 检查设备 → 进入产测模式 → 写入SN → 查询SN",
                Steps =
                [
                    new CommandDefinition { Name = "1.检查设备", Command = "get-state", TimeoutMs = 10000 },
                    new CommandDefinition { Name = "2.进入产测模式", Command = "shell bdft write -testmode B", TimeoutMs = 60000, DelayAfterMs = 1000, SuccessRegex = BDFT_WRITE_REGEX, FailureRegex = BDFT_FAIL_REGEX },
                    new CommandDefinition { Name = "3.写入SN", Command = "shell bdft write -sn {0}", TimeoutMs = 60000, InputPrompts = ["请输入 SN"], SuccessRegex = BDFT_WRITE_REGEX, FailureRegex = BDFT_FAIL_REGEX },
                    new CommandDefinition { Name = "4.查询SN", Command = "shell bdft read -sn", TimeoutMs = 30000, SuccessRegex = BDFT_READ_REGEX, FailureRegex = BDFT_FAIL_REGEX },
                ]
            }
        ];
    }
}