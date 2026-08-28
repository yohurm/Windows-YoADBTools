# 分层与 crate 边界

## 目标与非目标

| # | 目标 | 成功标准 |
|---|------|----------|
| G1 | 轻量化 | 安装包 ≤ 12 MB；复用系统 WebView；无自包含运行时 |
| G2 | YoUI | 界面由 `@yohu/ui` 构成；token 单源 |
| G3 | 功能 | 终端 / 文件 / 日志 / 投屏对齐需求 §5 |
| G4 | 性能 | 默认 10k 环 + 3 会话 + 虚拟列表；批量 IPC |
| G5 | 中文 | WebView 原生 IME |

本期不做：macOS/Linux 交付、插件热加载、重实现 ADB 协议、每窗口一条 logcat、查询 DSL。投屏在面板内嵌（ADR-v6-015），不是非目标。

## 层模型

```text
YoUI + modules + workbench     UI（WebView）
        ↓ @yohu/api
yohu-adbtools                  Tauri 壳（commands 薄转发）
        ↓
files / logsrv / mirror / update     capability
        ↓（设备能力经 adb；update 不经 adb）
yohu-adb                       设备运输（adb.exe）
        ↓
yohu-domain                    规则（无 IO）
yohu-runtime ∥ yohu-protocol   宿主过程/持久化/OS 根  ∥  wire
```

不建名为 `yohu-foundation` 的杂烩 crate。

## 各 crate

| crate | 职责 | 禁止 |
|-------|------|------|
| `yohu-runtime` | `process` / `persist` / `os_paths` | 产品类型、设备路径、HTTP、Tauri |
| `yohu-protocol` | serde DTO、身份、事件名 | IO、判定、正则 |
| `yohu-domain` | 判定、安全根、过滤、选择、`apply_setting`、内存 AppLog | 进程、fs、reqwest、Tauri |
| `yohu-adb` | 工具解析、信号量、devices/ls/ps、实现 `Runner` | 日志会话、文件浏览用例、投屏 demux |
| `yohu-files` / `logsrv` / `mirror` | 各自用例 | capability 互引；绕过 SafetyRoot |
| `yohu-update` | 更新检查（GitHub/蒲公英） | 依赖 adb |
| `yohu-adbtools` | 组合根、IPC 映射、任务中心、OLE 拖出 | 业务判定、路径校验 |

`yohu-adb → yohu-domain` 是 DIP：`AdbClient` 实现 `Runner`。不要拆。

## `yohu-runtime` 三模块

- **process**：`ProcessRunner`（`run_capture` / `run_streaming` / `spawn_child`）/ `kill_tree` / `ChildHandle` / `ProcessOutput` / `ProcessError`。不返回 `ExecOutcome` 或 `AdbError`。掉线文案判定留在 adb。`run_streaming` 即计划稿的流式入口（曾写 `spawn_streaming`）。
- **persist**：`atomic_write` + `backup_corrupt`（`.tmp` rename；`.corrupt-<ts>`）。不解析 settings/library schema。
- **os_paths**：`app_data_root(product_dir_name)` + `open_path`。产品子目录仍由壳拼。

不抽：Capture/Mirror 槽位状态机、`RingBuffer<LogLine>`、`RemotePath`、Fs trait、统一 `YohuError`。

## 仓库布局

```text
core/yohu-{runtime,protocol,domain,adb,files,logsrv,mirror,update}
app/yohu-adbtools
ui/packages/{api,ui,workbench} + modules/* + apps/shell
tools/  adb sidecar + scrcpy-server + fake-adb
```

## 被否决的 UI 栈

C#/WPF、Avalonia AOT、Slint/egui（IME）、Electron、WinUI 3、csbindgen 双栈。选定 Tauri 2 + SolidJS（ADR-v6-002～004）。
