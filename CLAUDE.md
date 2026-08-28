# Yohu-Windows-ADBTools

## 项目定位
多模块 Windows 桌面设备工具工作台（Yohu ADB Tools）。**v6 全新架构（2026-08-14 定稿）：推倒重来，不兼容旧设计与旧代码**。C#/WPF（v5）已下线，不再作为实现依据。

- 需求：`docs/requirements/需求分析.md`（v6 版）
- 架构：`docs/architecture/README.md`（分层/IPC/模块/ADR-v6-001～022）；右键菜单见 `docs/architecture/右键菜单-v6.md`

## 技术栈
- **核心**：Rust（tokio），Cargo workspace：`yohu-runtime`（进程/原子写/OS 根）∥ `yohu-protocol`（wire，零 IO）← `yohu-domain`（判定/安全根/过滤）← `yohu-adb`（设备运输）← `yohu-logsrv` / `yohu-files` / `yohu-mirror`；`yohu-update` 只依赖 protocol+runtime。**core 零 Tauri 依赖**（ADR-v6-005）
- **桌面壳**：Tauri 2（窗口/sidecar/升级；IPC = invoke 命令 + 批量事件）；`app/yohu-adbtools` 是唯一引用 Tauri 的 crate；`commands/` 只转发，编排在 `device_catalog` / `library_store` / `group_runs`
- **UI**：TypeScript + SolidJS + Vite，pnpm workspace（`--filter`，含 `ui/turbo.json` 任务声明）：`@yohu/api`（类型化 IPC）→ `@yohu/ui`（YoUI）→ `@yohu/workbench`（壳）+ `@yohu/modules/*`
- **组件库**：YoUI / `@yohu/ui` 第一公民（公开组件 `Yo*` 标注；token 单源；lint 禁硬编码色值/字号/动效时长/圆角）；见 `docs/architecture/youi.md`
- **右键菜单（ADR-v6-019）**：引擎在 `@yohu/ui` `context-menu/`（`defineContextMenu` / `openContextMenu` / 壳唯一 `YoContextMenuHost`）；场景表按模块 `menu.ts` 收口；禁止模块自挂 `YoContextMenu`。详见 `docs/architecture/右键菜单-v6.md`
- **目标平台**：Windows 10/11 x64；复用系统 WebView2（不捆绑运行时）
- **打包**：Tauri bundler（NSIS per-user）+ WebView2 embedBootstrapper；安装包 **≤ 12 MB**；sidecar 官方 adb.exe（不重实现 ADB 协议，ADR-v6-008）

## 核心功能
1. **设备管理** — `yohu-adb` 的 `devices -l` 扫描（device/unauthorized/offline + 型号）；全局焦点 + 每模块选择作用域（终端 MultiOptional，文件/日志 SingleRequired）；手动刷新 + 启动预热 + 可选自动刷新（`devices_auto_refresh`）
2. **ADB 命令终端** — 命令库/命令组（占位符 `{0}{1}`）/多设备并行/组编排（顺序、延时、失败中断）；成败判定在 core 领域层 `CommandEvaluator`（**失败正则 → 成功正则 → 退出码**，ADR-v6-009）；命令管理窗口（深拷贝编辑、全量提交、取消零污染）
3. **文件管理** — `ls` 浏览、push/pull（`transfer/progress` 事件 200ms 节流 + 可取消）、删除/新建目录；**core 侧 SafetyRoot 强制校验**（`/sdcard`、`/storage` 子路径，拒绝 `..`，不信任 UI，ADR-v6-013）
4. **日志分析** — core **每设备一路** logcat（`adb logcat -v threadtime,uid`）+ 设备级共享环形缓冲（`buffer_capacity` 默认 10000，与 UI 镜像/可见区同一上限）；**窗口/过滤在 UI 消费端**（ADR-v6-006）：多窗口 Tab（默认 System，Scope=all；可按包名/PID 再开）；每窗口绑定 serial + capturing/fromSeq；启停只打当前窗口，设备流按窗口引用计数 0↔1 / 1↔0；切焦点不停其他设备；进程索引（`ps` 2.5s 周期）+ 包名 PID 自动重绑（历史 PID 集上限 8）；AS 风格过滤栏（级别含以上/包名含子进程开关/精确 PID/Tag/关键字，无正则）；每窗口独立暂停（Space）与滚动挂起（离开底部只计数不跟滚）；清设备缓冲 = `logcat -c` + 清共享缓冲；导出 txt 走 core（`log.export`，持有全量缓冲）；快捷键 Space/Ctrl+L/Ctrl+F/Ctrl+T/Ctrl+W/Ctrl+Tab；掉线只停并清空该 serial 的窗口
5. **投屏显示** — 官方 `scrcpy-server` 4.1 sidecar + `yohu-mirror` 自写客户端（reverse 优先，forward+dummy 回退）；WebView2 WebCodecs 画进面板；默认只读视频；可选控制注入；每设备一路 + generation 槽位
6. **设置面板** — `adb_path`（立即）/`data_root`（重启）/`devices_auto_refresh`（重启）/`buffer_capacity`（窗口立即、采集环下次启动）/`clear_device_on_start`（下次采集）/`theme`（立即，默认 system）/`density`（立即，默认 comfortable＝鸿蒙 PC）/`mirror_*`（下次启动）；设置根固定 `%LOCALAPPDATA%\YohuAdbTools\settings\`；关于页身份与路径来自 `system.info`

## 架构约定（v6，ADR 全量见架构文档 §14）
- **依赖方向**：`UI → @yohu/api → IPC ← commands ← core crates`；`yohu-runtime ∥ yohu-protocol`；`yohu-adb → runtime+protocol+domain`；设备 capability → adb；`yohu-update` 禁止 adb。`apps/shell` 是唯一组合点（`registerModule`）；模块只依赖 `@yohu/api` + `@yohu/ui`。禁止 core 引用 Tauri、UI 模块互 import / 依赖 `@yohu/workbench`（`scripts/check-ui-deps.mjs`）、跨层绕过 IPC
- **批量 IPC（ADR-v6-007）**：logcat 行/传输进度 100–200ms 聚合（单批 ≤1000 行 / 512KB，先到先发），**禁逐行**；背压：下游事件队列有界，溢出**丢推送不丢环**（RingBuffer seq 单调），UI 经 `log/overflow` 提示后 `log.replay(fromSeq)` 补齐。**导出现状**见 ADR-v6-021（session-logs，不是环）。**投屏帧例外**：`mirror/packet` 逐帧 `try_send`（可丢帧）。**Tauri 2.9 事件名禁止点号**（ADR-v6-020），事件用 `/`（`log/lines`），invoke 命令名仍点分（`log.export`）
- **采集模型（ADR-v6-006/016）**：每设备至多一路 logcat 流（多设备可并行）；槽位 Empty/Starting/Live/Stopping；`start` **仅 Live adopt**，Starting/Stopping 等待；`CaptureState` 带 generation 且必达；窗口=会话订阅（serial/capturing/fromSeq），过滤/可见列表仍在 UI；设备流按窗口引用计数；切焦点不停其他设备；`start` 失败与成功均以 `log.capture.status` 快照对账；启动中可并发 `stop` 取消 Starting
- **会话与过滤**：Scope（All=System / Package / Pid）；包名匹配 = PidSet ∪ HistoryPidSet；PID 精确相等；级别最低含以上；Tag/关键字包含（OrdinalIgnoreCase）；过滤变更仅当前窗口重建可见区（且只重放 seq≥fromSeq）
- **成败判定分离**：ADB 客户端不判定；判定在 `yohu-domain`（CommandEvaluator）
- **应用日志 vs 设备日志严格分离（ADR-v6-010）**：设备 logcat 自持；应用操作日志内存环形（不落盘）；崩溃经 Rust panic hook 写 `logs/panic-*.log`
- **模块静态组合（ADR-v6-012）**：无插件热加载；模块 descriptor（id/title/icon/selectionMode/Component）注册进 `@yohu/workbench` 注册表
- **右键菜单（ADR-v6-019）**：场景表在各模块 `menu.ts`；`openContextMenu` 打开；壳唯一 Host。禁止 View 自挂 `YoContextMenu`
- **编辑即快照**：命令管理深拷贝编辑、保存全量提交（原子写：临时文件 + rename，损坏备份 `.corrupt-<ts>`）
- **后台任务**：长任务（采集/传输/命令组/投屏）登记任务中心，状态栏展示；退出序列 = 根 CancellationToken cancel → 任务收敛（超时 3s 强杀 adb 进程树）→ 设置 flush
- **新增模块**：实现 `ModuleDescriptor`（见 `docs/architecture/workbench.md`）→ 在 `apps/shell` 静态 `registerModule`
- **数据与路径**：全部在 `%LOCALAPPDATA%\YohuAdbTools\`（无管理员权限）；命令库 `data/modules/adb-terminal/config/library.json`（schemaVersion 2；损坏或 schema 不匹配则备份后写默认库）

## 目录结构（v6 目标，见架构文档 §4.1）
```
docs/
├── requirements/需求分析.md            # v6 需求（量化成功标准 §3）
└── architecture/                       # README.md + identity/layers/ipc/youi/workbench/modules/adr
core/
├── yohu-runtime/                       # 宿主：process / persist / os_paths（零产品类型）
├── yohu-protocol/                      # wire 类型（serde，无 IO）：DeviceInfo/LogLine/LogBatch/AppEvent…
├── yohu-domain/                        # 纯领域：命令库/CommandEvaluator/GroupExecutor/RemotePath/SafetyRoot/设置模型
├── yohu-adb/                           # ADB 客户端：tool(sidecar)/client/parse（进程在 runtime）
├── yohu-logsrv/                        # 采集服务：CaptureService/RingBuffer/Batcher/ProcessIndexService
├── yohu-files/                         # 文件：browse/transfer/mutate
├── yohu-mirror/                        # 投屏：官方 scrcpy-server + 自写客户端
└── yohu-update/                        # 更新检查（GitHub/蒲公英）
app/
└── yohu-adbtools/                      # Tauri 壳：commands(薄)/state/sidecar/panic
ui/
├── packages/
│   ├── api/                            # @yohu/api：类型化 invoke + 事件订阅
│   ├── ui/                             # YoUI / @yohu/ui：tokens + 组件 + keymap + context-menu
│   ├── workbench/                      # @yohu/workbench：壳（设备栏/导航/状态栏/设置/注册表）
│   └── modules/{terminal,files,logs,mirror}/
└── apps/shell/                         # Vite 入口（frontendDist）
tools/
├── adb.exe + AdbWinApi.dll + AdbWinUsbApi.dll   # sidecar 资源
├── scrcpy-server                       # 官方 scrcpy-server 4.1（scripts/setup-scrcpy-server.ps1）
└── fake-adb/                           # 脚本化假 adb（core 集成测试 fixture）
scripts/verify-v6-{smoke,full,logs-perf}.ps1
```

## 构建命令
```bash
# Rust：构建（含 fake-adb 明文 bin，集成测试依赖）→ 测试 → 静态检查
cargo build --workspace
cargo test --workspace
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
1. `cargo build --workspace && cargo test --workspace` — 全部通过（含 fake-adb 集成：单流采集/世代/取消/掉线清缓冲）
2. `cargo clippy --all-targets -- -D warnings` — 0 警告
3. `pnpm -C ui typecheck && pnpm -C ui test` — 全部通过（含 @yohu/api ↔ yohu-protocol 契约测试）
4. `scripts/verify-v6-smoke.ps1` — 冒烟全绿（启动/导航/设备/设置）
5. `scripts/verify-v6-full.ps1` — 全功能联调全绿（需设备；覆盖终端/文件/日志多会话）
6. `scripts/verify-v6-logs-perf.ps1` — 性能验收：默认 10k 缓冲 + 3 会话 + 虚拟列表，批量 IPC < 16ms/批，UI 交互不掉帧
7. `cargo tauri build` — 安装包 ≤ 12 MB
8. 安装启动冒烟确认

## 实施状态
- 架构设计定稿（2026-08-14）；实现按 **S1–S5 strangler-fig**（架构文档 §15）推进，总工期约 9–12 周（2 人）
- **S1 骨架已落地**：Cargo workspace + Tauri 壳（`app/yohu-adbtools`，含 `log.capture.status`）+ YoUI + `@yohu/api` + `@yohu/workbench` + sidecar adb
- **S2 终端模块已落地**：命令库（默认库 3 组 9 命令，首次启动写入）/ 命令组 / 多设备并行 / 成败判定（core 领域层）/ 命令管理窗口（快照编辑、全量提交、取消零污染）/ 占位符填值对话框 / 结果日志流；GroupProgress 携带命令名；@yohu/ui 新增 YoDialog/YoToast(createToaster)
- **S3 文件模块已落地**：设备目录浏览（YoVirtualList 虚拟化）/ 上传（tauri-plugin-dialog 选文件）/ 下载（save 对话框）/ 删除（确认框 + core 侧 SafetyRoot）/ 新建目录 / 传输面板（进度条/取消/状态徽章）
- **S4 日志模块已落地**：多窗口 Tab（默认 System；按包名/PID 再开，每窗口绑定设备）/ 每设备一路 logcat + 窗口引用计数启停 / 切焦点不停其他设备 / AS 风格过滤栏（级别含以上/Tag/关键字，无正则）/ 进程索引重绑（历史 PID 集上限 8）/ 信号扫描（崩溃/ANR 徽章）/ 堆叠折叠 / 溢出回补（log.replay）/ 导出 / 快捷键（Space/Ctrl+L/F/T/W/Tab）/ 批量 IPC 消费端过滤（pipeline.ts 纯函数 + 14 单测）
- **体积优化**：release profile 启用 lto + codegen-units=1 + strip + panic=abort → exe 6.4 MB
- **NSIS 安装包已打通**：`cargo tauri build` 产出 **5.80 MB**（≤12 MB 达标；含 sidecar adb 内嵌 + WebView2 embedBootstrapper 引导）；原生 tauri-cli（cargo install）；tauri.conf 路径约定（frontendDist 相对 config 目录、beforeX 命令 cwd=app/）；NSIS 工具链离线缓存方案（winget NSIS → `%LOCALAPPDATA%\tauri\nsis-3.11`）；scripts/build-release.ps1 全流程封装
- **fake-adb 集成测试已落地**：tools/fake-adb（脚本化假 adb，零共享状态：测试拷贝 exe + 同名 json 到独立临时目录）；yohu-logsrv 集成测试含 adopt / stop 期间 start 等世代；期间修复两个真实缺陷：run_capture 关闭通道忙循环（饿死 stderr 读任务）与 Batcher 生产端结束丢尾部批次（现冲刷 flush）
- **真机测试已落地**（motorola edge 60 pro，自动跳过无设备环境）：yohu-adb 6 用例（扫描/型号/进程/组命令端到端）、yohu-logsrv 4 用例（采集 1000 行/导出/清缓冲/导出过滤）、yohu-files 3 用例（浏览/push-pull/传输中途取消）；yohu-adb 另含 3 用例自愈式扫描（fallback.rs）
- **Phase A/B UI 打磨已落地**：三层 token + 双主题语义板 + 密度变量 + 级别板 + 动效 token（HarmonyOS 100/160/300/350ms + 标准/减速曲线，motion.ts ↔ theme.css 契约测试，lint 扩展动效时长纪律）；YoDialog/YoSelect/YoTabs/YoTree 键盘/ARIA 补全；YoVirtualList 选择模式（roving tabindex + ↑/↓/Home/End/Enter/Space + listbox/option 语义）；Dialog/Toast 入场动画（prefers-reduced-motion 降级）
- **Phase C 壳重绘已落地**：设备卡片化（surface 卡片 + 选中 accent-soft 底 + 2px accent 左边条 + listbox/option 键盘选择）；导航键盘可达（aria-current + Enter/Space）；状态栏任务悬停明细（TaskInfo.detail，core 任务中心扩展）；设置页分组卡片 + 生效徽章（立即/重启/下次采集）+ 保存 toast + adb_path 浏览按钮 + density 设置（core 全链路：protocol → settings_store → settings.get/set → UI 应用 data-density）；壳组件测试 11 用例（vi.mock @yohu/api + plugin-dialog）
- **Phase D 三模块重绘已落地**：① 日志——列对齐行（时间 18ch/PID/级别/Tag≤24ch/消息，等宽 tabular-nums）、级别 3px 左条、Fatal 反色块、信号行底色+Error 左条、行选中（VirtualList 选择模式）、检索框放大镜+accent 边框、三态空态（未采集引导/等待/过滤无命中）、状态行采集指示+设备+滞后回补提示、会话右键菜单（关闭其他/重命名/复制会话，YoTabs onContextMenu）；修复溢出回补提示被回补批次立即清除的缺陷；② 终端——结构化结果卡片（设备维度分组、组头汇总徽章、折叠输出区失败默认展开、用时经 core duration_ms 全链路）、命令库树命令数徽章+模板 title（YoTree badge/title）；③ 文件——面包屑路径栏（逐级可点）、双栏（目录下钻 | 文件列表含 ls 修改时间列，core RemoteEntry.mtime 全链路）、扩展名分类色图标、传输卡片（方向图标/速度采样/终态 3s 淡出自动移除）
- **模块级测试扩展**：logs store 34 用例（窗口生命周期/System 默认/同设备引用计数/多设备并行/切焦点不停流/消费端过滤/溢出回补/掉线按 serial）+ pipeline 15 用例（新增行级信号标记）；files 纯函数 13 用例（新增 splitPath/fileCategory）；Vitest 累计 **248** 用例；Rust 侧 ls 解析新增 mtime 断言、settings 契约 4 用例
- **验收现状**：`cargo build --workspace && cargo test --workspace` 全绿（含 7 集成 + 4 设置契约 + 13 真机）、clippy -D warnings 通过、Vitest **248** 用例全绿、tsc -b 0 错误、`pnpm lint`（ADR-v6-011 token 纪律：色值/字号/动效时长/圆角，scripts/check-ui-tokens.mjs）通过、**verify-v6-smoke.ps1 已实际跑通**（进程存活/无 panic/sidecar 解压/默认命令库写入；期间修复 events.rs 必须在 tauri 异步运行时 spawn 的启动崩溃）
- 待续（S5，需设备，脚本已备）：安装包安装冒烟、全功能联调、日志性能验收、产线镜像预置 WebView2
- **v5 已下线**：C#/WPF 与存档文档均已移除，不再作为实现依据
- **sidecar 二进制**：`tools/adb.exe` 等被 .gitignore 排除（不入库）；新机器构建前运行 `scripts/setup-adb.ps1` 与 `scripts/setup-scrcpy-server.ps1`

## 需求文档
详见 `docs/requirements/需求分析.md`
