# Yovo-Windows-ADBTools

## 项目定位
多模块 Windows 桌面设备工具工作台（Yovo ADB Tools，模块化单体 v5）。基于 ADB 提供产线调试与测试工具集：ADB 命令终端、文件管理、日志分析；投屏显示为 Planned 占位（需求与设计见 `docs/requirements/需求分析.md`、`docs/architecture/日志分析模块-功能细化与多窗口架构.md`）。

## 技术栈
- 语言/框架：C# + WPF (.NET 8)，多项目模块化单体（Host / Shell / Platform / Platform.Abstractions / Modules）
- 目标平台：Windows 10/11 (x64)
- 打包方式：.NET 自包含单文件发布（`dotnet publish src/Yovo.Host -c Release -p:PublishSingleFile=true --self-contained true -r win-x64 -o publish`）
- 依赖注入：Microsoft.Extensions.DependencyInjection（组合根在 `Yovo.Host/App.xaml.cs`）
- MVVM：CommunityToolkit.Mvvm（源生成器 `[ObservableProperty]` / `[RelayCommand]`）
- UI：WPF-UI (Fluent)，设计 Token 集中在 `src/Yovo.Shell/Resources/ThemeTokens.xaml`
- ADB 集成：内嵌 adb.exe 于 `Yovo.Platform`（嵌入资源），运行时解压到 `DataRoot/tools/adb/`

## 核心功能
1. 设备管理 — `IDeviceDirectory` 扫描（一次 `devices -l` 解析型号）+ `IDeviceSessionHub` 会话（全局焦点 + 每模块选择作用域，单设备自动选中）
2. ADB 命令终端 — 命令库/命令组/多设备并行执行/成功判定（FailureRegex→SuccessRegex→退出码）/命令管理窗口（快照编辑、脏关闭确认）
3. 文件管理 — 设备文件浏览（ls 解析）、push/pull 传输（进度 → 后台任务中心）、删除（安全根 + 确认）/新建目录
4. 日志分析 — 设备级单流采集（ADR-LA-001）+ **多会话 Tab**（Xshell 式，F40）；会话按 **包名/PID 划分**（F41/F42，进程索引 `ps` 周期刷新 + PID 自动重绑含历史，F43）；AS 风格过滤栏（级别含以上 / 包名/进程 / 精确 PID / 检索，无正则框，F44）；每会话独立暂停/滚底/信号计数/导出 txt；清空=会话可见区，清设备缓冲=Device 级（`logcat -c` 且清共享缓冲）；快捷键 Ctrl+T/W/Tab（会话操作）；软换行/复制专用命令/预设/JSON 导出已移除（ADR-LA-004/005）
5. 设置面板 — ADB 路径（`adb.path`，立即生效）+ 数据目录（`data.root`，重启生效）+ 日志缓冲/显示行数/开采前 `logcat -c`

## 架构约定（v5 模块化单体）
- **依赖方向**：`Host → Shell/Modules → Platform → Platform.Abstractions`；模块间零实现依赖（NetArchTest 强制，`tests/Yovo.Architecture.Tests`）
- **Platform.Abstractions 无 WPF 类型**：模块通过接口切片消费平台能力（IAdbCommandExecutor/IDeviceSessionHub/IAppLog/IAppPaths 等），UI 端口（IWindowService/IUiDispatcher）由 Shell 实现
- **贡献点**：模块 `Contribute` 注册导航/视图映射/设置页（`IContributionRegistry`）；视图经 `ViewKey` + `ViewLocator` 解析，契约层不出现 UserControl
- **模块自治**：模块数据写 `IAppPaths.ModuleData(Id)`；命令库路径 `data/modules/adb-terminal/config/library.json`（v4 用户命令库自动迁移）
- **模块通信**：进程内 `IEventBus` 集成事件（设备刷新/离线/焦点变化/后台任务）；同步调用走契约接口，异步通知走总线
- **编辑即快照**：命令管理深拷贝编辑、保存全量提交、取消零污染
- **成败判定分离**：ADB 客户端不判定成败；判定在模块领域（CommandEvaluator）
- **设备日志 vs 应用日志严格分离**（ADR-006）：logcat 自持，IAppLog 只承载操作日志（内存环形 + Snapshot，不落盘）
- **后台任务**：长任务（传输/采集）登记 `IBackgroundTaskCenter`，状态栏展示，退出前取消
- **占位模块**：`PlannedModule`（IsPlanned=true）仅贡献导航 + "开发中"页；投屏 screen-mirror 本期占位（ADR-007）
- 新增模块：实现 IModule（Descriptor/ConfigureServices/Contribute/InitializeAsync/DisposeAsync）→ 注册到 `Yovo.Host/ModuleCatalog.cs`

## 目录结构
```
docs/
├── requirements/    # 需求文档（需求分析.md）
└── architecture/    # 日志分析模块-功能细化与多窗口架构.md（R0 裁剪 + M1 多会话已落地，M2 分屏未开始）
src/
├── Yovo.Host/                  # 组合根：App / ModuleCatalog / 启动与退出序列
├── Yovo.Shell/                 # 工作台壳：MainWindow / 导航 / 设备栏 / 状态栏 / ViewLocator / WindowService / ThemeTokens
├── Yovo.Platform/              # 平台内核（无 UI）：Paths / SettingsStore / AppLog / ProcessRunner / ToolResolver / AdbClient / DeviceDirectory / SessionHub / EventBus / BackgroundTaskCenter / ContributionRegistry
├── Yovo.Platform.Abstractions/ # 全部平台契约（无 WPF）：IModule / 贡献点 / 设备 / 进程 / ADB 切片 / 设置 / 日志 / 消息 / 任务
└── Modules/
    ├── Yovo.Modules.AdbTerminal/  # 命令终端（Domain/Application/Presentation 分层）
    ├── Yovo.Modules.FileManager/  # 文件管理
    └── Yovo.Modules.LogAnalyzer/  # 日志分析
tests/                      # 单元（Platform/AdbTerminal/LogAnalyzer）+ 架构（NetArchTest）
scripts/verify-v5-smoke.ps1 # UIA 冒烟回归（UI 审查验收清单）
```

## 构建命令
```bash
# 开发构建
dotnet build YovoAdbTools.sln

# 全量测试
dotnet test YovoAdbTools.sln

# 发布为单文件 exe
dotnet publish src/Yovo.Host -c Release -p:PublishSingleFile=true --self-contained true -r win-x64 -o publish

# UI 冒烟回归（应用需关闭）
powershell -ExecutionPolicy Bypass -File scripts/verify-v5-smoke.ps1

# 全功能联调（应用需关闭；覆盖导航/终端执行/命令管理/文件/日志/设置/占位）
powershell -ExecutionPolicy Bypass -File scripts/verify-v5-full.ps1

# 日志分析多会话联调（应用需关闭 + 设备在线；覆盖 M1：多 Tab/按包名开窗/进程索引/关 Tab）
powershell -ExecutionPolicy Bypass -File scripts/verify-v5-multisession.ps1
```

## 发布检查清单（G-P1-2）
1. `dotnet build YovoAdbTools.sln` — 0 警告 0 错误
2. `dotnet test YovoAdbTools.sln` — 全部通过（含架构测试）
3. `scripts/verify-v5-full.ps1` — 全功能联调全绿（无 crash 日志）
4. `dotnet publish src/Yovo.Host -c Release ... -o publish` — 单文件自包含
5. 启动 `publish/YovoAdbTools.exe` 冒烟确认

## 需求文档
详见 `docs/requirements/需求分析.md`
