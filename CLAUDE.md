# Yovo-Windows-ADBTools

## 项目定位
多模块 Windows 桌面设备工具工作台（Yovo ADB Tools）。**v6 全新架构（2026-08-14 定稿）：推倒重来，不兼容旧设计与旧代码**；旧 C#/WPF 实现（v5）仅作历史存档，按 strangler-fig 路线（架构文档 §15）在 S4 验收前维持，S5 下线。

- 需求：`docs/requirements/需求分析.md`（v6 版）
- 架构：`docs/architecture/架构设计-v6.md`（全细节 + ADR-v6-001~015）
- 旧文档：`docs/architecture/日志分析模块-功能细化与多窗口架构.md`（仅存档）

## 技术栈
- **核心**：Rust（tokio），Cargo workspace：`yovo-protocol`（wire 类型）← `yovo-domain`（命令库/判定/安全路径）← `yovo-adb` / `yovo-logsrv` / `yovo-files`；**core 零 Tauri 依赖**（ADR-v6-005）
- **桌面壳**：Tauri 2（窗口/sidecar/升级；IPC = invoke 命令 + 批量事件）；`app/yovo-app` 是唯一引用 Tauri 的 crate，commands 层禁止写业务逻辑
- **UI**：TypeScript + SolidJS + Vite，pnpm monorepo（Turborepo）：`@yovo/api`（类型化 IPC）→ `@yovo/ui`（自研组件库）→ `@yovo/app`（壳）+ `@yovo/modules/*`
- **组件库**：`@yovo/ui` 第一公民（token 单源，ESLint 禁硬编码色值/字号）；组件清单见架构文档 §7.2
- **目标平台**：Windows 10/11 x64；复用系统 WebView2（不捆绑运行时）
- **打包**：Tauri bundler（NSIS per-user）+ WebView2 embedBootstrapper；安装包 **≤ 12 MB**；sidecar 官方 adb.exe（不重实现 ADB 协议，ADR-v6-008）

## 核心功能
1. **设备管理** — `yovo-adb` 的 `devices -l` 扫描（device/unauthorized/offline + 型号）；全局焦点 + 每模块选择作用域（终端 MultiOptional，文件/日志 SingleRequired）；手动刷新 + 启动预热 + 可选自动刷新（`devices.autoRefresh`）
2. **ADB 命令终端** — 命令库/命令组（占位符 `{0}{1}`）/多设备并行/组编排（顺序、延时、失败中断）；成败判定在 core 领域层 `CommandEvaluator`（**失败正则 → 成功正则 → 退出码**，ADR-v6-009）；命令管理窗口（深拷贝编辑、全量提交、取消零污染）
3. **文件管理** — `ls` 浏览、push/pull（`transfer.progress` 事件 200ms 节流 + 可取消）、删除/新建目录；**core 侧 SafetyRoot 强制校验**（`/sdcard`、`/storage` 子路径，拒绝 `..`，不信任 UI，ADR-v6-013）
4. **日志分析** — core 单流采集（`adb logcat -v threadtime`）+ 设备级共享环形缓冲（`buffer.capacity` 默认 50000）；**会话/过滤在 UI 消费端**（ADR-v6-006）：多会话 Tab 按包名/PID/全部划分；进程索引（`ps` 2.5s 周期）+ 包名 PID 自动重绑（历史 PID 集上限 8）；AS 风格过滤栏（级别含以上/包名含子进程开关/精确 PID/Tag/关键字，无正则）；每会话独立暂停/滚底/信号计数/清空；清设备缓冲 = `logcat -c` + 清共享缓冲；导出 txt 走 core（`log.export`，持有全量缓冲）；快捷键 Space/Ctrl+L/Ctrl+F/Ctrl+T/Ctrl+W/Ctrl+Tab；掉线/切换停采并清缓冲（防串设备）
5. **设置面板** — `adb.path`（立即）/`data.root`（重启）/`devices.autoRefresh`（重启）/`buffer.capacity`（下次采集）/`display.limit`（立即）/`clear.device.on.start`（下次采集）/`theme`（立即）；设置根固定 `%LOCALAPPDATA%\YovoAdbTools\settings\`

## 架构约定（v6，ADR 全量见架构文档 §14）
- **依赖方向**：`UI → @yovo/api → IPC ← commands ← core crates`；core crates 间 `yovo-{adb,logsrv,files} → yovo-domain → yovo-protocol`；禁止 core 引用 Tauri、UI 模块互 import（depcheck 强制）、跨层绕过 IPC
- **批量 IPC（ADR-v6-007）**：logcat 行/传输进度 100–200ms 聚合（单批 ≤1000 行 / 512KB，先到先发），**禁逐行**；背压：下游事件队列有界，溢出**丢推送不丢环**（RingBuffer seq 单调），UI 经 `log.overflow` 提示后 `log.replay(fromSeq)` 补齐；导出/重放永远基于 core RingBuffer 快照
- **采集模型（ADR-v6-006）**：每设备至多一路 logcat 流（世代 token 防旧流迟到）；会话/过滤/可见列表/信号扫描/堆叠折叠全在 UI 会话 store；core 只做采集 + 环形缓冲 + 进程索引 + 导出
- **会话与过滤**：Scope（All/Package/Pid）；包名匹配 = PidSet ∪ HistoryPidSet；PID 精确相等；级别最低含以上；Tag/关键字包含（OrdinalIgnoreCase）；过滤变更仅当前会话重建可见区
- **成败判定分离**：ADB 客户端不判定；判定在 `yovo-domain`（CommandEvaluator）
- **应用日志 vs 设备日志严格分离（ADR-v6-010）**：设备 logcat 自持；应用操作日志内存环形（不落盘）；崩溃经 Rust panic hook 写 `logs/panic-*.log`
- **模块静态组合（ADR-v6-012）**：无插件热加载；模块 descriptor（id/title/icon/selectionMode/Component/createStore）注册进 `@yovo/app` 注册表
- **编辑即快照**：命令管理深拷贝编辑、保存全量提交（原子写：临时文件 + rename，损坏备份 `.corrupt-<ts>`）
- **后台任务**：长任务（采集/传输/命令组）登记任务中心，状态栏展示；退出序列 = 根 CancellationToken cancel → 任务收敛（超时 3s 强杀 adb 进程树）→ 设置 flush
- **占位模块**：投屏 `@yovo/module-mirror`（isPlanned）仅贡献导航 + "开发中"页
- **新增模块**：实现 `ModuleDescriptor`（见架构文档 §7.3）→ 注册到 `@yovo/app` 的 registry（静态 import）
- **数据与路径**：全部在 `%LOCALAPPDATA%\YovoAdbTools\`（无管理员权限）；命令库 `data/modules/adb-terminal/config/library.json`（schemaVersion 2，**v5 数据一次性迁移**，数据迁移 ≠ 设计兼容）

## 目录结构（v6 目标，见架构文档 §4.1）
```
docs/
├── requirements/需求分析.md            # v6 需求（量化成功标准 §3）
└── architecture/架构设计-v6.md         # v6 全细节架构 + ADR-v6-001~015
core/
├── yovo-protocol/                      # wire 类型（serde，无 IO）：DeviceInfo/LogLine/LogBatch/AppEvent…
├── yovo-domain/                        # 纯领域：命令库/CommandEvaluator/GroupExecutor/RemotePath/SafetyRoot/设置模型
├── yovo-adb/                           # ADB 客户端：tool(sidecar)/process/devices/client/parse
├── yovo-logsrv/                        # 采集服务：CaptureService/RingBuffer/Batcher/ProcessIndexService/ExportService
└── yovo-files/                         # 文件：browse/transfer/mutate
app/
└── yovo-app/                           # Tauri 壳：commands(薄)/state/sidecar/panic
ui/
├── packages/
│   ├── api/                            # @yovo/api：类型化 invoke + 事件订阅
│   ├── ui/                             # @yovo/ui：tokens + 组件（YVirtualList/YTabs/YTree/…）
│   ├── app/                            # @yovo/app：壳（设备栏/导航/状态栏/设置/注册表）
│   └── modules/{terminal,files,logs,mirror}/
└── apps/shell/                         # Vite 入口（frontendDist）
tools/
├── adb.exe + AdbWinApi.dll + AdbWinUsbApi.dll   # sidecar 资源
└── fake-adb/                           # 脚本化假 adb（core 集成测试 fixture）
scripts/verify-v6-{smoke,full,logs-perf}.ps1
```

## 构建命令（S1 骨架落地后生效）
```bash
# Rust：测试 / 静态检查
cargo test
cargo clippy --all-targets -- -D warnings

# 前端：依赖 / 类型检查 / 测试 / 构建
pnpm install
pnpm -C ui typecheck
pnpm -C ui test          # Vitest（过滤管道/信号扫描/组件）
pnpm -C ui build

# 开发运行（WebView2 + dev server）
cargo tauri dev

# 发布（NSIS ≤ 12 MB；WebView2 模式见架构文档 §11.2）
cargo tauri build
```

## 发布检查清单（v6 版）
1. `cargo test` — 全部通过（含 fake-adb 集成：采集世代/取消/掉线清缓冲）
2. `cargo clippy --all-targets -- -D warnings` — 0 警告
3. `pnpm -C ui typecheck && pnpm -C ui test` — 全部通过（含 @yovo/api ↔ yovo-protocol 契约测试）
4. `scripts/verify-v6-smoke.ps1` — 冒烟全绿（启动/导航/设备/设置）
5. `scripts/verify-v6-full.ps1` — 全功能联调全绿（需设备；覆盖终端/文件/日志多会话）
6. `scripts/verify-v6-logs-perf.ps1` — 性能验收：50k 缓冲 + 3 会话 + 2000 可见行，批量 IPC < 16ms/批，UI 交互不掉帧
7. `cargo tauri build` — 安装包 ≤ 12 MB
8. 安装启动冒烟确认

## 实施状态
- 架构设计定稿（2026-08-14）；实现按 **S1–S5 strangler-fig**（架构文档 §15）推进，总工期约 9–12 周（2 人）
- **S1 骨架已落地**：Cargo workspace（core 五 crate）+ Tauri 壳（app/yovo-app，25 条命令全量接线）+ @yovo/ui 组件库 + @yovo/api 契约层 + 工作台壳（设备栏/导航/设置/状态栏/模块注册表）+ sidecar adb
- **S2 终端模块已落地**：命令库（默认库 3 组 9 命令，首次启动写入）/ 命令组 / 多设备并行 / 成败判定（core 领域层）/ 命令管理窗口（快照编辑、全量提交、取消零污染）/ 占位符填值对话框 / 结果日志流；GroupProgress 携带命令名；@yovo/ui 新增 YDialog/YToast(createToaster)
- **验收现状**：release exe **11.90 MB**（≤12MB）；cargo test 全绿、clippy -D warnings 通过、Vitest **76** 用例全绿、tsc -b 0 错误
- 待续：S3 文件模块 / S4 日志模块 UI（core 侧采集/传输服务已就绪，UI 为占位页）；fake-adb 集成测试 fixture；NSIS 安装包构建
- **v5 遗留**：全部 C#/WPF 代码、旧测试与 v5 联调脚本已移至 `old/`（`old/src`、`old/tests`、`old/YovoAdbTools.sln`、`old/scripts`），仅存档参考，不作为 v6 实现依据；S5 随新架构全功能验收后彻底移除
- **sidecar 二进制**：`tools/adb.exe` 等被 .gitignore 排除（不入库）；新机器构建前运行 `scripts/setup-adb.ps1` 从 `old/src/Yovo.Platform/Tools/` 拷贝

## 需求文档
详见 `docs/requirements/需求分析.md`
