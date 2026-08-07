# Yovo-Windows-ADBTools 产测助手

## 项目定位
通过 ADB 实现工厂产测功能的轻量化 Windows 桌面助手。

## 技术栈
- 语言/框架：C# + WPF (.NET 8)
- 目标平台：Windows 10/11 (x64)
- 打包方式：.NET 自包含单文件发布 (`dotnet publish -p:PublishSingleFile=true`)
- ADB 集成：内嵌 adb.exe，系统无 ADB 时自动回退内置版本
- MVVM：CommunityToolkit.Mvvm
- DI：Microsoft.Extensions.DependencyInjection

## 核心功能
1. 设备管理 — 扫描连接设备、显示状态、支持多选并行发送
2. 命令管理 — 预设命令库、分组分类、JSON 配置驱动、可编辑可扩展
3. 执行引擎 — 单条命令 / 命令组 / 规则流程（预留）
4. 配置管理 — 命令库导入导出、测试结果保存

## 目录结构
```
docs/
├── requirements/    # 需求文档
├── architecture/    # 架构设计
└── guides/          # 开发指南 / 使用手册
src/FactoryHelper/
├── Models/          # 数据模型
│   ├── AdbDevice.cs
│   ├── AdbCommand.cs
│   ├── CommandGroup.cs
│   ├── GroupStep.cs
│   └── CommandResult.cs
├── Services/        # 服务层
│   ├── AdbService.cs      # ADB 进程管理、设备扫描、命令执行
│   ├── ConfigService.cs   # JSON 配置加载/保存
│   └── MesService.cs      # MES 接口（预留）
├── ViewModels/
│   └── MainViewModel.cs   # 主界面 ViewModel
├── Views/            # 视图（当前 MainWindow 即主视图）
├── MainWindow.xaml
├── MainWindow.xaml.cs
└── App.xaml / App.xaml.cs
tools/               # 内置工具（adb.exe + DLL）
```

## 设计原则
- 轻量化：单 exe 体积小、资源占用低
- 免依赖：内嵌 ADB，无需额外安装 SDK
- 产线友好：中文界面，简洁清晰，适用于产线操作人员
- 多设备并行：支持多选设备，命令同时发送到所有选中设备

## 构建命令
```bash
# 开发构建
dotnet build

# 发布为单文件 exe
dotnet publish -c Release -p:PublishSingleFile=true --self-contained true -r win-x64 -o publish
```

## 需求文档
详见 `docs/requirements/需求分析.md`