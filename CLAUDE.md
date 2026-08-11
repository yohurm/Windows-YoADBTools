# Yovo-Windows-ADBTools

## 项目定位
多模块 Windows 桌面工具平台（Yovo ADB Tools），基于 ADB 提供设备调试与产测工具集。ADB 命令终端为当前首个模块，后续可扩展投屏显示等模块（见 `docs/architecture/架构设计-v4.md`）。

## 技术栈
- 语言/框架：C# + WPF (.NET 8)
- 目标平台：Windows 10/11 (x64)
- 打包方式：.NET 自包含单文件发布 (`dotnet publish -p:PublishSingleFile=true`)
- ADB 集成：内嵌 adb.exe，运行时解压到 `%LOCALAPPDATA%\YovoAdbTools\adb\`
- MVVM：CommunityToolkit.Mvvm（源生成器 `[ObservableProperty]` / `[RelayCommand]`）
- UI：WPF-UI (Fluent)，资源集中在 `Resources/ThemeTokens.xaml`

## 核心功能
1. 设备管理 — 扫描连接设备（一次 `devices -l` 进程调用解析型号）、状态显示、多选并行发送
2. 命令管理 — 预设命令库、分组分类、单文件 JSON 配置驱动（`Config/library.json` + 版本号 + 损坏自动备份）
3. 执行引擎 — 单条命令 / 命令组 / 成功判定策略（FailureRegex→SuccessRegex→退出码）
4. 测试结果 — 执行结果自动落盘 CSV（`%LOCALAPPDATA%\YovoAdbTools\Reports\`）

## 目录结构
```
docs/
├── requirements/    # 需求文档
├── architecture/
│   ├── 架构设计-v4.md   # 现行架构（v4 重构后）
│   └── 架构设计-v3.md   # 历史文档（v4 前）
└── guides/          # 开发指南 / 使用手册
src/FactoryHelper/
├── Core/            # 平台扩展点：IModule / IModuleContext / ModuleRegistry / 附加行为
├── Platform/        # 平台级服务（4 个，模块共享）：
│   ├── AdbProcessService.cs   # ADB 纯进程调用（不判定成败）
│   ├── DeviceService.cs       # 设备快照 + 选择会话（不可变 record + 事件）
│   ├── LogService.cs          # 日志（后台批量落盘 + 按 Source 过滤 + 5MB 轮转）
│   └── SettingsService.cs     # 配置（按模块命名空间 + 原子写）
├── Shell/           # 主窗口：ShellViewModel（纯导航）/ DevicePanelViewModel / MainWindow
├── Modules/
│   └── AdbTerminal/ # 终端模块（自治单元，自持服务与模型）
│       ├── AdbTerminalModule.cs   # 模块 Id 常量 + Initialize 组装
│       ├── Models/                # CommandDefinition / CommandGroup / CommandLibrary 等
│       ├── Services/              # CommandRepository / CommandEvaluator / ExecutionService / ReportWriter
│       ├── ViewModels/            # TerminalViewModel / CommandManagerViewModel
│       ├── Views/                 # TerminalView / CommandManagerWindow / TagPickerDialog / WindowService
│       └── Resources/             # library.default.json（内置命令库，嵌入资源）
├── Resources/        # UI Token 统一资源（颜色/间距/样式）
└── Tools/            # 内置工具（adb.exe + DLL）
```

## 架构约定（v4）
- **依赖方向**：`Shell/Modules → Core/Platform`，模块间不互相依赖；模块内 `Views → ViewModels → Services → Models`
- **模块上下文只暴露平台能力**（Adb/Devices/Log/Settings）；模块业务服务模块内自持
- **编辑即快照**：管理窗口基于深拷贝编辑，保存全量提交，取消零污染
- **服务层不暴露 UI 类型**（集合/控件）；事件在后台线程，UI 侧用 SynchronizationContext 编组
- **标签 = Category 纯派生**，无独立标签管理
- **预留模块**：Shell 层声明 `PlannedModule`（不占注册路径，导航显示"开发中"占位）；未来注册同 Id 真实模块后自动替换
- 新增模块：实现 IModule（Id/Title/IconGlyph/SortOrder）→ 注册到 App.xaml.cs → 自动出现在导航

## 构建命令
```bash
# 开发构建
dotnet build

# 发布为单文件 exe
dotnet publish -c Release -p:PublishSingleFile=true --self-contained true -r win-x64 -o publish
```

## 需求文档
详见 `docs/requirements/需求分析.md`
