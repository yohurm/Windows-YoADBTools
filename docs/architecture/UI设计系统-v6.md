# Yohu ADB Tools v6 — UI 设计系统规范（UI 打磨单一事实源）

> **状态：** v1.40（2026-08-20，设备栏选中滑块过冲）    
> **调研依据：** HarmonyOS 开发者文档设计规范（本地 `HarmonyOS-Developer-docs`：`设计/设计指南/针对多设备设计/电脑/{设计概述,应用设计,窗口框架}`、`通用设计基础/{布局,视觉风格/文本排版,间隔参数}`、`应用 UX 体验标准/电脑应用 UX 体验标准`，提炼见 `docs/architecture/harmonyos-design-notes.md`）、Evil Martians《Devs in mind 2025》、Fluent 2（密度/排版）、Mirafold（语义 token 体系）、Kobalte（无头可及性交互模型）、业界日志查看器实践。  
> **执行载体：** `@yohu/ui`（token 单源 + 组件）+ `@yohu/app`（壳）+ `@yohu/modules/*`（三模块）。所有改动必须同步更新本文件。
>
> **v1.40 变更（设备栏选中滑块过冲）**：`YoIndicator` fill 宿主 `overflow-x: hidden`，裁切软弹簧宽过冲。设备列表宿主只 `overflow: hidden`；项滚动走内层 scroller（`overflow-x: hidden` + `overflow-y: auto`）。禁止在滑块宿主上写 `overflow: auto`——双轴 auto 会在 Windows 画出横竖条并互相锁死（同 v1.37）。
>
> **v1.39 变更（页眉选中设备名）**：终端 / 文件 / 日志 / 投屏 `YoChrome` 标题后统一展示选中设备名（`deviceLabel`，中性徽章）。数据链：`DeviceInfo.model` → domain `device_display_name` → `DeviceSession.selectedLabel`。一台用型号（无型号回退 serial）；终端多台「首台名 等 n 台」；无选中不显示。设置不展示。禁止模块自拼 serial 或再扫目录取型号。
>
> **v1.38 变更（应用身份与数据目录）**：展示名 / 版本 / 图标 / LocalAppData 目录走 `system.info.identity` + `paths`（protocol 常量单源）。标题栏用应用位图（`YoTitleBar.logoSrc`），不用终端字形冒充品牌。设置页新增「关于」。状态栏版本禁止写死。数据目录说明写清 `data/` 与固定的 `settings/`、`logs/` 分层。
>
> **v1.37 变更（Select 浮层 hug）**：下拉菜单铬层只负责落点（`popover-place`）；内容 hug。`min-width` = 触发钮，禁止锁死 `width`。默认 `overflow: hidden`；仅内容高于可用空间才 `overflow-y: auto`，横向永远 hidden——`overflow-y: auto` 会把 `overflow-x` 算成 auto，Windows 画出底部「宽度调整条」。选中/键盘索引在 `select-model.ts`。
>
> **v1.36 变更（设置项控件靠右）**：设置表单项统一「标签+生效徽章靠左、功能控件靠右 hug」。日志显示列的 `YoCheckbox` 组走同一控件槽，禁止整行左起铺开；说明文字仍独占下一行。
>
> **v1.35 变更（设置注入会话）**：应用设置与设备同一条链。`settingsStore` 是唯一 UI 投影；`AppLayout` 经 `DeviceSession.settings` 注入模块。日志显示列 / 导出走注入快照，禁止模块 `settings.get`。`buffer_capacity` 仍由日志 store 投影（采集活过视图）；`settings.changed` 控制面必达。
>
> **v1.34 变更（日志显示列）**：设置项 `log_display_columns`（立即生效）控制清单表头与行显示哪些元数据列（时间 / UID / PID / TID / 级别 / Tag）。消息列始终在。缺字段视为开启。轨道按可见列内联写入，禁止在 CSS 写死七列。
>
> **v1.33 变更（日志固定表头）**：日志清单表头钉在 `YoVirtualList` 外（`flex-shrink: 0` + `--yohu-row-height-header`），与行共用 `.yohu-logs__cols` 定宽轨道。无排序/拖宽，不走 `YoColHeader`。级别列改为 `4ch` 以容纳「级别」文案。表头与清单背板 `--yohu-canvas`。
>
> **v1.32 变更（右键菜单宿主）**：菜单引擎收口到 `@yohu/ui` `context-menu/`（`defineContextMenu` / `openContextMenu` / `YoContextMenuHost`）。壳只挂一份 Host。模块场景表在各自 `menu.ts`。禁止 View 自挂 `YoContextMenu`。详见 `右键菜单-v6.md`。
>
> **v1.31 变更（多选选中片邻接圆角）**：连续选中行合成一块圆角矩形。代数 `adjacentJoin`（solo/start/middle/end）；class `--sel-start/mid/end` 削平邻接圆角，并用选中色补 hairline。`YoVirtualList` 行间 hairline 单源。禁止模块再写行分割线或选中圆角。日志列改为定宽 grid：`[时间 18ch] [UID 10ch] [PID 6ch] [TID 6ch] [级别 2ch] [Tag 24ch] [消息]`（禁止 max-width 导致消息错位）。`threadtime,uid` 的 UID 为数字或名；解析失败整行通栏，禁止画 `0 ?` 假列。
>
> **v1.30 变更（表头悬浮片铺满列格）**：`--yohu-col-header-content-pad` 只写在 `.yohu-col-header__label`。排序钮 `.yohu-interactive` 宿主 `padding: 0`。禁止把文案边距写在 `<button>` 上（绝对定位 `::before` 按内容盒计算，宿主 padding 会把悬浮片缩成文案胶囊）。
>
> **v1.29 变更（表头轨道贴格）**：清单行不再用左右 padding 冒充首列边距（那会把悬浮片整列推离左缘）。首列文案/文件名走 content-pad / name padding；`YoColHeader` 悬浮片 `inset 0` + `radius-none`，铺满矩形列格。
>
> **v1.28 变更（表头悬浮片与文案解耦）**：`YoColHeader` 上 `--yohu-col-header-overlay-inset` 与 `--yohu-col-header-content-pad` 分权。禁止用内容 padding 去挤悬浮片，也禁止用 ripple-inset 去推文案。
>
> **v1.27 变更（表头排序铺满内容区）**：排序钮铺满 `YoColHeader` 内容区（列宽 × 表头高），不 hug 文案。分割线仍在轨道铬上。
>
> **v1.26 变更（表头轨道与文本分权）**：新增 `YoColHeader`。列轨道拥有宽度、hairline 分割线、`YoColResizer`；排序走 `.yohu-interactive`。未激活的排序图标不占位。模块不再自绘列分割线。
>
> **v1.25 变更（页眉行高单源）**：`YoChrome` 标题行 `min-height` 走 `--yohu-control-height`（密度 token）；底垫 `--yohu-layout-chrome-pad`（`Spacing.Sm`）。禁止把 min-height 写在外壳上（border-box 会把无按钮页的标题抬高）。
>
> **v1.24 变更（文件清单行分割）**：文件四列清单行间画 hairline；表头与清单背板改 `--yohu-canvas`，与面板 `surface` 分层。路径栏不再对清单拉分割线。表头排序走 `.yohu-interactive`（禁止自写 hover 底）。选中宿主仍透明，不盖住 ripple。
>
> **v1.23 变更（Select 自适应展开）**：`YoSelect` 菜单默认 Portal 出滚动容器，按视口剩余空间向下或向上展开。v1.37 起高度 hug 内容、宽度不锁死。
>
> **v1.22 变更（设置路径项）**：ADB 路径 / 数据目录 / 默认导出路径统一为只读展示框（绝对路径）+ 「浏览」。展示框宽 ≤ `--yohu-layout-settings-control-max`，超长折叠中间并保留末段。空值显示 `system.info` 解析出的绝对路径。
>
> **v1.21 变更（页壳单源）**：效率型/占位模块（终端/文件/日志/投屏）根节点一律 `YoPage`。页垫 `--yohu-layout-page-inset` / 间距 `--yohu-layout-page-gap`，数值单源 `Spacing.Md`（12vp）。禁止模块 CSS 再铺一套 `height:100%` + `padding: space-md`。功能标题只出现在 `YoChrome`，空态不得复写模块名。设置页仍走 `--yohu-layout-page-margin`。
>
> **v1.20 变更（画布卡片单源）**：模块分区（终端库/结果、文件清单/预览/传输、日志会话、投屏占位、设置分组）一律 `YoPanel`。铬 = surface + radius-md + hairline 描边 + XS 阴影；pane 内部裁切、阴影留在外壳。禁止模块 CSS 再铺 `surface` + `radius-md`。
>
> **v1.19 变更（页眉与内容区同缘）**：模块必须单根页壳（禁止 fragment 把 `YoChrome` 与内容并列交给 presence）。效率型/占位模块页垫走 `YoPage`；设置页页眉不进滚动容器，标题与分组卡片共用 `--yohu-layout-page-margin`。
>
> **v1.18 变更（三键顺序）**：窗口三键从左到右为最小化、最大化（或还原）、关闭（跟 Windows 标题栏习惯，不跟鸿蒙 max-min-close）。
>
> **v1.17 变更（侧栏分割线）**：去掉标题栏底部分割线；侧栏展开时在导航与内容区之间拉 hairline（`--yohu-border`），收起侧栏时不画。
>
> **v1.16 变更（窗口铬贴合）**：侧栏钮与三键等宽 48vp、贴窗口右缘，热区铺满栏高（无内边距）。关闭悬停铺满该键。
>
> **v1.15 变更（窗口铬 Compact）**：标题栏只承担窗口铬后，高度走 HarmonyOS 电脑 Compact **40vp**（不再用 Default 56vp）。三键去圆形底板、键间距收进热区，竖条宽 **48vp**。侧栏钮为正方形（边长=标题栏高），不跟三键抢宽度。
>
> **v1.13 变更（通铺+分区）**：窗口 canvas 通铺（内容/状态栏不拉结构分割线）。模块分区恢复 `radius-md` 卡片，靠 surface 与 12vp 间距成组，不描外边框。分割线只留必要处：侧栏与内容区、页签指示轨、表头/列、路径栏对清单、数据行、对话框头尾、控件描边。文件预览为独立分区，不嵌在清单卡片内。
>
> **v1.12 变更（PC 通栏+贴边）**：模块工具栏经 `YoChrome` 传送到 `YoTitleBar` 中区（HarmonyOS 窗口框架：工具栏与标题栏结合）。侧栏可收起为抽屉。设置/投屏一级标题进标题栏。控件补 leading token。
>
> **v1.11 变更（PC 排版）**：根节点正文 14 / 行高 1.55（不再吃浏览器 16px）；补 Caption_M≥10、Subtitle_M、行高 tight/ui/data、字重 Light；排版工具类 `.yohu-type-*`。效率型内容区贴边（通栏下方不再套 12vp 页垫）。对话框 Title_S Bold + PC 小圆角，去掉误用的窗口最小 360×240。模块栏标题降为 Subtitle Bold。设置页 Title_S Bold + PC 40vp 边距。
>
> **v1.10 变更（分段按钮）**：新增 `YoSegmentedButton`（对齐 SegmentButtonV2）。默认 `tab`：灰背板 + **白选择块** + `radius-xl` 32vp + `--yohu-shadow-xs` + 主色 Medium 字；`capsule` 才是强调色块。选择块按 item 实测盒滑动。页签栏仍走 `YoTabs`。日志「划分」用默认 tab。
>
> **v1.9 变更（选中单源清扫）**：删除死 dual class（`*--selected` / 列表 `*--active`，Tabs 下划线 `--active` 除外）。语义色逃生统一 `.yohu-badge` / `.yohu-tone`。宿主禁止自绘底盖住选中片。面包屑祖先次要色、当前墨色（不是全段 accent）。范围芯片改 `YoBadge`。
>
> **v1.8 变更（选中单源）**：侧栏 / 命令树 / 命令管理 / 下拉 / 虚拟列表共用同一配方：`--yohu-state-selected` = 品牌实底，`--yohu-state-selected-fg` = 反白，`--yohu-ripple-inset: 0`。删除表面自写选中字色与侧栏特判、删除 `AccentSofter`。距背板只靠容器 padding。
>
> **v1.7 变更（鸿蒙 PC 默认）**：`:root` = comfortable（正文 14 / 控件 32 / 数据行 26）；`[data-density=compact]` 才是产线收敛。新安装与缺 `density` 字段均 `comfortable`。窗口默认 1200×800。对话框弱中性遮罩 + 获焦/失焦阴影，最小 360×240、最大宽 400；Toast ≤3s / 最大 400；按钮最大 448；菜单最小 224。动效补 150/200/400ms。
>
> **v1.6 变更（官方色板）**：`@yohu/ui` Primitive 层改为 HarmonyOS NEXT 系统 Token 原值（宇宙蓝 `#0A59F7` / `#317AF7`、雪域灰 `#F1F3F5`、文本四档 90/60/40/20%、warning/alert/confirm、interactive 5/10/20%）。不再为 WCAG 4.5 改写语义色；正文仍按鸿蒙 §1.6 门禁（浅 4.5:1 / 深 5:1）。布局补齐 PC 窗口默认 1200×800、页边距 40vp、断点 600/840。
>
> **v1.1 变更（HarmonyOS 融合）**：主强调色 → 宇宙蓝；圆角阶梯 → 4/8/16/20/32；动效 → 鸿蒙时长分级 100/160/300/350ms + 标准曲线 `cubic-bezier(0.4,0,0.2,1)`/减速 `(0,0,0.4,1)`。PC 桌面端遵循鸿蒙「PC 小 2vp、8vp 网格」原则做密度收敛。
>
> **v1.2 变更（底向上布局）**：设备数徽章紧跟「设备」标题；`YoIconButton.loading` 走 `--yohu-dur-loop` 旋转；设置页两列网格 + 页面滚动（面板不裁切）；文件管理改为资源管理器四列 + 可收起预览 + `YoContextMenu`/`YoFileIcon`；命令管理三栏；日志采集从开始时刻清空缓冲并出流。
>
> **v1.3 变更（交互态架构）**：公开组件统一 `Yo*` 标注（禁止 `Y*`）；CSS/token 命名空间保持 `yohu-*`。补齐交互态 / ripple / 焦点 / 布局 token；列表·树·菜单·导航·命令管理共用 `.yohu-interactive` 选中片（`radius-sm` + `inset space-xs`），禁止各表面自写选中底与裸圆角。圆角阶梯补 `2xs`/`full`/`pill`；间距补 `2xs`。纪律 lint 拦截裸 `border-radius`。
>
> **v1.4 变更（token 单源闭环）**：`theme.css` 由 `tokens/emit-theme.ts` 从 TS 常量排出（契约测试强制磁盘文件一致）；包导出 `@yohu/ui/theme.css` 绑定 `theme + states`。协议 `Theme` 增加 `system` 且默认跟随系统（P7）。选中填充只用 `.yohu-interactive--selected`（不用 `aria-selected`，以免 Tabs 下划线被画成实底）。焦点环补 `.yohu-focus-host`（焦点在内部控件时）。`YoCheckbox` 改原生 `input[type=checkbox]`。
>
> **v1.5 变更（选中片几何）**：`--yohu-ripple-inset` 从四边 `space-xs` 改为 `0 var(--yohu-space-xs)`。依据 Material 3 `DropdownMenuSelectableItemPadding = 4dp` 仅横向、纵向铺满 Surface；HarmonyOS「距背板 4vp」指容器边距而非行内再削一圈。矮行（下拉/菜单/日志）选中片与行高对齐。`YoSelect` 选项 `min-height: control-height`，与 `YoContextMenu` 一致。

---

## 1. 设计原则（8 条，评估一切 UI 决策的标尺）

| # | 原则 | 落地含义 |
|---|------|----------|
| P1 | **为产线密度而设计** | 默认 comfortable（鸿蒙 PC 正文 14vp）；compact 仍可选作产线收敛，日志行不拉到手机 48vp |
| P2 | **键盘优先** | 所有高频操作有快捷键；组件完整键盘可达（Tab 导航 + 方向键 + Esc 层级退出） |
| P3 | **数据用等宽字体** | serial/PID/时间/日志正文/文件大小一律等宽 + `tabular-nums` 列对齐 |
| P4 | **语义色先行** | 颜色只表达语义（在线/通过/失败/警告/级别），装饰色不喧宾夺主 |
| P5 | **对比度达标** | 正文按鸿蒙 §1.6：浅色 ≥4.5:1、深色 ≥5:1；图标/标题 ≥3:1。语义色（confirm/warning/alert）用官方原值，优先作填充而非浅底正文 |
| P6 | **即时反馈** | 操作 200ms 内有反馈（按钮态/行高亮/toast）；长任务有进度与可取消 |
| P7 | **深色为一等公民** | 深浅主题同权维护（token 双板），默认跟随系统，可手动切换 |
| P8 | **零意外** | 危险操作必确认；关闭窗口有脏检查；破坏性动作不可逆时明确标注 |

---

## 2. Token 三层架构

```
Primitive（原始值：色板/字号/间距，不直接消费）
   ↓
Semantic（语义别名：--yohu-fg / --yohu-surface / --yohu-accent / --yohu-success…，主题相关）
   ↓
Component（组件级：--yohu-state-* / --yohu-level-* / --yohu-ripple-* / --yohu-focus-*，唯一被组件消费）
```

- 组件与模块 CSS **只允许引用 Semantic/Component 层**；Primitive 仅在 tokens 内出现。
- 主题切换 = 切换 Semantic 层变量（`[data-theme=light|dark]`），零运行时成本。用户偏好 `data-theme-pref` 可为 `system`（跟随 `prefers-color-scheme`）。`theme.css` 由 `emit-theme.ts` 从 TS 常量生成，禁止手改。
- 纪律检查脚本（`scripts/check-ui-tokens.mjs`）强制：组件外零硬编码色值/字号/动效时长/裸圆角。

### 2.0 组件标注

- **公开组件名**一律 `Yo` 前缀：`YoButton`、`YoVirtualList`、`YoTabs`…。禁止 `YButton` 这类单字母前缀。
- **CSS 类与 CSS 变量**保持产品命名空间 `yohu-*`（`.yohu-button`、`--yohu-accent`）。组件名 ≠ 样式前缀。
- 新增组件必须同时：`YoXxx` 导出 + `.yohu-xxx` 样式 + 本文件登记。

### 2.1 色彩系统（HarmonyOS NEXT 官方 Token）

Primitive 层 = 鸿蒙系统 Token 原值（ARGB → CSS `#RRGGBB` / `#RRGGBBAA`），见 `tokens/colors.ts` 的 `Harmony`。深色 `background_primary` 以文档正文为准（黑），不用表内 `#E5E5E5`。

| `--yohu-*` | 鸿蒙 Token | Light | Dark | 用途 |
|------------|------------|-------|------|------|
| `bg-base` | `background_secondary` / 深色 `background_primary` | `#F1F3F5` 雪域灰 | `#000000` | 窗口底色 |
| `surface` | `comp_background_primary` | `#FFFFFF` | `#202224` | 面板/卡片 |
| `surface-2` | `background_tertiary` / 深色 `background_secondary` | `#E5E5EA` | `#191A1C` | 次级表面 |
| `fg` / `fg-2` / `fg-3` / `fg-4` | `font_primary`…`fourth` | 黑 90/60/40/20% | 白 90/60/40/20% | 文本四级 |
| `fg-on` | `font_on_primary` | `#FFFFFF` | `#FFFFFF` | 强调底上的反色字 |
| `border` | `comp_divider` | 黑 20% | 白 20% | 常规边框/分割 |
| `border-strong` | `font_tertiary` | 黑 40% | 白 40% | 强调边框 |
| `accent` | `brand` | `#0A59F7` | `#317AF7` | 宇宙蓝 |
| `accent-soft` | `comp_emphasize_secondary` / `interactive_select` | 宇宙蓝 20% | 宇宙蓝 20% | 选中实底 |
| `accent-hover` / `pressed` | brand + `interactive` 5% / 10% | 叠黑 | 叠白 | 实心主按钮 |
| `success` | `confirm` | `#64BB5C` | `#5BA854` | 在线/通过（填充优先） |
| `warn` | `alert` | `#ED6F21` | `#DB6B42` | 二级警示/执行中 |
| `error` | `warning` | `#E84026` | `#D94838` | 一级警示/失败 |
| `offline` | `font_tertiary` | 黑 40% | 白 40% | 离线点 |
| `focus-ring` | `icon_sub_emphasize` | 宇宙蓝 40% | 宇宙蓝 40% | 键盘焦点环 |
| `disabled` | `background_fourth` | `#D1D1D6` | `#2E3033` | 禁用底 |

**logcat 级别板（复用官方语义色，无独立鸿蒙级别 Token）：**

| 级别 | 引用 | Light | Dark |
|------|------|-------|------|
| `--yohu-level-v` | `font_tertiary` | 黑 40% | 白 40% |
| `--yohu-level-d` | `brand` | `#0A59F7` | `#317AF7` |
| `--yohu-level-i` | `confirm` | `#64BB5C` | `#5BA854` |
| `--yohu-level-w` | `alert` | `#ED6F21` | `#DB6B42` |
| `--yohu-level-e` | `warning` | `#E84026` | `#D94838` |
| `--yohu-level-f` | `font_on` on `warning` | `#FFFFFF` on `#E84026` | `#FFFFFF` on `#D94838` |

### 2.2 排版

- 界面字体：`"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif`
- 数据/等宽：`"Cascadia Mono", Consolas, "Courier New", monospace`（`font-variant-numeric: tabular-nums`）
- 字号阶梯（默认 = 鸿蒙 PC）：Caption_M 10 / Caption 12 / Body 14 / BodyStrong 14 / Subtitle_M 14 / Subtitle 16 / Title_S 18；**compact 覆盖** 10 / 11 / 12.5 / 13.5 / 13 / 15 / 18
- 字重：Light 300 / Regular 400 / Medium 500 / Semibold 600 / Bold 700（Title Bold、Subtitle Medium、Body Regular）
- 行高：`--yohu-font-leading-tight: 1.25`（铬条/标题）/ `ui: 1.55`（正文）/ `data: 1.4`（日志/serial）
- 根节点：`html,body,#root` 使用 Body + leading-ui + `line-break: strict`（行首标点禁则）
- 工具类：`.yohu-type-title|subtitle|body|caption|data`（模块优先复用，禁止另起字号）

### 2.3 密度与布局

控件/行高走密度变量，布局宽走 `--yohu-layout-*`，禁止在组件或模块里写第二套数字。

| Token | compact | comfortable（默认） | 用途 |
|-------|---------|---------------------|------|
| `--yohu-control-height` | 26 | 32 | 按钮/输入/图标钮/路径栏 |
| `--yohu-control-height-sm` | 24 | 28 | 小按钮 |
| `--yohu-row-height` | 22 | 26 | 日志/文件数据行 |
| `--yohu-row-height-device` | 34 | 40 | 设备卡片 |
| `--yohu-row-height-nav` | 32 | 36 | 导航项 |
| `--yohu-row-height-header` | 28 | 32 | 表头 |
| `--yohu-segment-single` | 28 | 40 | 分段按钮单行（V2 `singleline_background_height` / V1 最小 28） |
| `--yohu-segment-hybrid` | 44 | 56 | 分段按钮图文（V2 `doubleline_background_height`） |
| `--yohu-title-bar-height` | 40 | 40 | 窗口铬（页眉回内容区后走 HarmonyOS Compact；不再随内容密度抬到 56） |

布局常量（不随密度变）：`--yohu-layout-shell-nav: 232px`、`--yohu-layout-sidebar: 280px`、`--yohu-layout-preview: 240px`、`--yohu-layout-settings-max: 920px`、`--yohu-layout-output-max: 260px`、`--yohu-layout-hit-splitter: 6px`、`--yohu-layout-gutter: 16px`、`--yohu-layout-grid-max: 2220px`、`--yohu-layout-page-inset` / `--yohu-layout-page-gap`（数值 = `Spacing.Md` 12vp，经 `YoPage` 消费）、`--yohu-layout-chrome-pad`（数值 = `Spacing.Sm` 8vp，经 `YoChrome` 消费）。

HarmonyOS 电脑/大屏补齐：`--yohu-layout-window-default-w/h: 1200×800`、`--yohu-layout-window-min-w/h: 360×240`、`--yohu-layout-page-margin: 40px`（PC 左右边距，设置页用）、`--yohu-layout-breakpoint-split: 600`（分栏）、`--yohu-layout-breakpoint-side: 840`（侧边页签）、`--yohu-layout-button-max: 448`、`--yohu-layout-dialog-max: 400`。数量约束 `LayoutLimits`：标题栏右侧 ≤3 图标、C 栏工具栏 ≤6、侧栏 ≤窗口宽 40%。间距补 `space-2xl=32`、`space-3xl=40`（Padding_level16/20）。控件行高仍按 P1 产线密度收敛，不改用手机 48vp 列表行。

效率型工作台：内容区从窗口标题栏下方**贴边**排布（`.yohu-layout__content` padding 0）；模块页眉与分区的内边距由 `YoPage` 承担（`page-inset` / `page-gap`）。设置页才用 `page-margin` 40vp。

描边宽：`--yohu-stroke-hairline: 1px`、`--yohu-stroke-accent: 2px`（焦点/左边条/Tab 指示）、`--yohu-stroke-emphasis: 3px`（级别条/结果卡强调）。

### 2.4 动效

- 时长分级（HarmonyOS）：`--yohu-dur-fast: 100ms`（hover/按下）、`--yohu-dur-small: 150ms`（小范围）、`--yohu-dur-normal: 160ms`（面板/下拉）、`--yohu-dur-local: 200ms`（局部删除）、`--yohu-dur-slow: 300ms`（页面级）、`--yohu-dur-enter: 350ms`（入场）、`--yohu-dur-progress: 400ms`（进度最短感知）、`--yohu-dur-toast: 3s`；循环指示：`--yohu-dur-loop: 800ms`、`--yohu-dur-loop-slow: 1.2s`
- 缓动：`--yohu-ease-standard: cubic-bezier(0.4,0,0.2,1)`（标准）、`--yohu-ease-decel: cubic-bezier(0,0,0.4,1)`（减速）、`--yohu-ease-loop: ease-in-out`（循环）；**出场加速曲线与语义 MotionSpec 见《动画系统-v6.md》**（ADR-v6-017）
- JS 消费侧经 `@yohu/ui` 导出 `MotionDuration` / `MotionEasing`（与 theme.css 契约测试强制一致）；动效时长硬编码由纪律 lint 拦截
- 完整行为（Presence / Collapse / 侧栏 `rail` / 配方目录 / 虚拟列表禁动）以 `docs/architecture/动画系统-v6.md` 为准，本节只登记 token 数字
- 用途克制：下拉展开/淡入淡出；**日志列表选中片无过渡**（性能优先，`.yohu-interactive` 默认无 transition）
- **加载循环**：`YoIconButton loading` 给图标加 `yohu-icon-button--loading`，按 `--yohu-dur-loop` 线性旋转；加载期间按钮 `disabled` + `aria-busy`。设备栏刷新、文件刷新等长操作必须走该入口，禁止模块自写 spinner。

### 2.5 图标

- **应用品牌图标**：`app/yohu-app/icons/icon.png`（1024，圆角矩形底板 + 透明四角，宇宙蓝）+ `icon.ico`。标题栏 / 关于 / favicon 走 `APP_ICON_SRC`（`/app-icon.png`），经 `YoTitleBar.logoSrc`；展示时不再二次裁圆角。禁止用模块字形（如 `terminal`）冒充应用图标。
- **唯一入口**：`@yohu/ui` 的 `<Icon name size>`；模块注册表 `icon: IconName`；工具栏用 `YoIconButton`（内部仍走 `Icon`）。
- **文件类型图标**：`<YoFileIcon name kind size>`（`file-icons.tsx` 工厂）。模块禁止内联文件 SVG；色值仅允许出现在该文件（纪律脚本豁免）。
- **禁止**：模块内再写一份 SVG、emoji 当图标、静态对象缓存 JSX 节点。
- **风格**：24×24 viewBox、描边 2、`currentColor`；`play`/`pause` 实心。新增通用图标只改 `icons.tsx` 的 `ICON_GLYPHS`。

### 2.6 圆角阶梯

| Token | 值 | 用途 |
|-------|----|------|
| `--yohu-radius-2xs` | 2px | 微标（Fatal 块、检索高亮） |
| `--yohu-radius-xs` | 4px | 面包屑级小控件 |
| `--yohu-radius-sm` | 8px | 按钮/输入/列表 ripple / 导航片 |
| `--yohu-radius-md` | 16px | 卡片/面板/对话框 |
| `--yohu-radius-lg` | 20px | 大卡片 |
| `--yohu-radius-xl` | 32px | 顶层浮层 |
| `--yohu-radius-full` | 50% | 正圆（状态点/spinner） |
| `--yohu-radius-pill` | 999px | 胶囊（徽章） |

`radius.ts` ↔ `theme.css` 契约测试强制一致。组件 CSS 禁止 `border-radius: <裸值>`。

### 2.7 交互态与选中 Ripple（单源）

列表行、树行、下拉选项、菜单项、导航项、命令管理项、表头排序 **共用同一配方**，禁止各文件再写 `background: accent-soft` / `nav-hover`。表头排序钮铺满 `YoColHeader` 内容区；悬浮片 `--yohu-col-header-overlay-inset: 0`、圆角 `none`（铺满矩形列格）；文案边距 `--yohu-col-header-content-pad` 只写在 `.yohu-col-header__label`，禁止写在 `.yohu-interactive` 宿主。禁止在 `.yohu-files__cols` 上用左右 padding 把首列轨道推离左缘。

**状态色（Component 层）**

| Token | 算法 | 用途 |
|-------|------|------|
| `--yohu-state-hover` | `interactive_hover`：中性 5%（浅黑/深白） | 悬浮 / 键盘活动 |
| `--yohu-state-pressed` | `interactive_pressed`：中性 10% | 按压 |
| `--yohu-state-selected` | `interactive_active` = `var(--yohu-accent)` | 选中实底（侧栏/树/命令/列表同一源） |
| `--yohu-state-selected-fg` | `font_on_primary` = `var(--yohu-fg-on)` | 选中行文字/图标 |
| `--yohu-accent-soft` | `comp_emphasize_secondary`（品牌 20%） | 徽章/范围芯片，禁止当选中底 |

**几何（可在子树覆盖，不可另起炉灶）**

| Token | 默认 | 含义 |
|-------|------|------|
| `--yohu-ripple-radius` | `var(--yohu-radius-sm)` | 选中片圆角 |
| `--yohu-ripple-inset` | `0` | 铺满行盒；距背板 = 容器 padding |

**载体**：`tokens/states.css` 的 `.yohu-interactive`。选中只用 `.yohu-interactive--selected`（**不要**用 `[aria-selected]` 上填充：`YoTabs` 的 `aria-selected` 表示下划线激活，不是实底选中）。键盘活动用 `.yohu-interactive--active`。禁止 Tree/Select/命令管理/壳再写选中字色。单选实底由 `YoIndicator` 在项之间滑动；虚拟列表与多选块仍是每项 `::before`。

- 实心底控件（`YoButton` / `YoCheckbox` / `YoSegmentedButton`）走变体色 + `--yohu-accent-hover/pressed`，不走列表 ripple。
- `YoSegmentedButton` 对齐 SegmentButtonV2：默认 tab 白选择块（`surface` + `shadow-xs` + `fg`），capsule 才用 accent + `fg-on`。背板/选择块 `radius-xl`（32vp）。不作一级导航、不承载删除/添加。
- `YoTabs` 激活指示是 `YoIndicator` underline（底边 `--yohu-stroke-accent` 滑块），hover 仍走 ripple；不要把 Tab 激活画成选中填充。
- 语义色逃生：`.yohu-badge`（徽章）与 `.yohu-tone`（日志级别 / 检索高亮等）在选中行内保持自身色。
- 选中宿主必须透明底：自绘 `background` 会盖住 `z-index: -1` 的选中片。
- 禁止再挂表面 dual class（`yohu-tree__row--selected` / `yohu-select__option--selected` / `yohu-*-item--active`）。键盘高亮仍用 `.yohu-interactive--active`。
- **多选邻接圆角（VirtualList / 文件清单 / 日志）**：`adjacentJoin` 判断上下行是否同属选中块。`--sel-start` 削底角、`--sel-mid` 四角皆直、`--sel-end` 削顶角；孤立选中仍四角 `--yohu-ripple-radius`。邻接缝的 hairline 用 `--yohu-state-selected` 补色。禁止模块再写一套选中圆角。

**焦点环（单源）**

- `.yohu-focus-ring`：`outline: var(--yohu-focus-width) solid var(--yohu-focus-ring)` + `outline-offset: var(--yohu-focus-offset)`
- `.yohu-focus-ring--inset`：offset 用 `--yohu-focus-offset-inset`
- `.yohu-focus-host` / `--inset`：焦点在内部控件时（`focus-within:has(:focus-visible)`），用于 `YoTextField` / `YoCheckbox`
- 禁止控件再写 `outline: 2px solid var(--yohu-accent)` 或手写同一套 outline

---

## 3. 壳（Shell）规范

```
┌────────────────────────────────────────────────────────────┐
│ TitleBar（应用图标+应用名 │ 留白 │ 侧栏钮 │ 三键）                   │
├──────────────────┬─────────────────────────────────────────┤
│ 设备栏            │  模块标题区        功能栏（执行/清屏/…） │
│ 在线设备          │ ───────────────────────────────────── │
│ 列表行            │  ┌ 圆角分区 ┐  ┌ 圆角分区 ┐             │
│ 型号/串号         │  │ surface  │  │ surface  │             │
│ 模块导航          │  └──────────┘  └──────────┘             │
│                   │           canvas 通铺                   │
│ 版本 · 设备 · 任务（状态栏，无顶线）                            │
└────────────────────────────────────────────────────────────┘
```

- **设备栏**：标题行 = 折叠钮 +「设备」+ 数量徽章（徽章紧跟标题，不推到最右）+ 刷新（`YoIconButton loading` 旋转）；设备行（型号一行 + serial 等宽一行，主次上下间隔 2vp + 在线点 + 未授权徽章，无白卡片）；空态给引导文案；选中只加 `.yohu-interactive--selected`（高亮 = 当前模块解析后的执行目标）。单选实底由 `YoIndicator` fill 在 list 宿主内滑动，宿主 `overflow: hidden` 裁切弹簧过冲；项滚动在 `__scroller`（横向 hidden、纵向 auto）。禁止把 `overflow: auto` 写在滑块宿主上。MultiOptional（终端）：单击替换勾选，Ctrl/Meta+click 加减选；未勾选回退全局焦点，不把全部在线设备当作已选。
- **导航**：图标 16px（`<Icon>` 单源，currentColor）+ 标题；激活只加 `.yohu-interactive--selected`；Planned 项「开发中」胶囊徽章。图标节点每次渲染新建。设备栏与导航共用 `--yohu-layout-rail-inset`。侧栏可整栏收起（标题栏 `sidebar` 抽屉钮）。
- **模块页眉**：在右侧内容区顶部（`YoChrome`）。左侧为功能标题区（Subtitle Bold）+ 选中设备名（`deviceLabel` 中性徽章，文案来自 `DeviceSession.selectedLabel`），右侧为功能栏；与窗口标题栏分离，不挤进中区。无操作的模块（设置）只显示标题，但标题行高度仍是 `--yohu-control-height`（与有按钮的页同一占位）。底垫 `--yohu-layout-chrome-pad`。页眉是页壳的第一子节点（`flex: 0 0 auto`），禁止与内容区作为 fragment 兄弟交给模块转场。
- **模块页壳**：效率型与占位模块（终端/文件/日志/投屏）根节点一律 `YoPage`（`.yohu-page`：`padding: page-inset`、`gap: page-gap`）。`YoChrome` 是第一子节点。内容进 `YoPanel`（`variant=pane` 撑满）。禁止模块再写一套页垫。空态文案不得复写页眉模块名。设置页分组走 `YoPanel` 默认 card，边距仍是 `page-margin`。
- **通铺与分区**：窗口 `--yohu-canvas` 通铺；标题栏与工作区、状态栏不拉结构分割线。侧栏展开时与内容区之间画 hairline。模块分区 = `YoPanel`（surface + radius-md + hairline 描边 + XS 阴影）。分割线还用于：页签指示、表头/列、数据行、对话框头尾、输入类控件。路径栏与清单靠 canvas 分层，不另拉线。
- **状态栏**：左「展示名 v版本」（`system.info.identity`）/ 中留白 / 右「设备 · 任务 · 状态」；任务悬停显示明细。透明贴合 canvas。Caption + leading-tight。
- **对话框**：Title_S Bold；PC 小圆角 `radius-sm`；宽 ≤400、高 ≤90%；**不要**把窗口最小 360×240 套到浮层确认框。
- **快捷键统一表（v6.1 目标）**：`Ctrl+K` 命令面板（模块跳转/刷新设备/开始采集…）；模块内快捷键不变。

---

## 4. 模块 UI 规范

### 4.1 日志分析（核心打磨对象）

- 布局：内容区顶部模块页眉（标题 + 选中设备名 + 采集操作）→ 会话 Tab（canvas 上）→ `YoPanel` 会话分区（过滤 / **固定表头** + 虚拟列表 / 状态行）。
- 行结构（列对齐，等宽，**定宽 grid 轨道**）：`[时间 18ch] [UID 10ch] [PID 6ch] [TID 6ch] [级别 4ch] [Tag 24ch] [消息 →]`。UID 来自 `logcat -v threadtime,uid`（数字或 `root`/`shell`/`wifi` 名）。禁止 `max-width` / 不定宽 flex 让消息列左右错位。解析失败（level=`?`）整行消息通栏，禁止画 `0 ?` 假列。级别用色字 + `--yohu-stroke-emphasis` 左条；Fatal 反色块（`radius-2xs`）；级别与检索高亮挂 `.yohu-tone`；行选中由 `YoVirtualList` 的 `.yohu-interactive` 承担，模块禁止再写行 hover 底。行间 hairline 走 VirtualList 单源。
- **固定表头**：列名钉在滚动区外，与行共用 `.yohu-logs__cols`；高度 `--yohu-row-height-header`；背板 `--yohu-canvas`。无排序、无列宽拖拽，禁止改走 `YoColHeader`。禁止把表头放进虚拟列表行。显示列读壳注入的 `DeviceSession.settings.log_display_columns`（消息始终在），`grid-template-columns` 按可见列内联写入。禁止模块再 `settings.get` 或把显示列拷进 logStore。
- 信号行（崩溃/ANR）行底色 `--yohu-signal-bg` + 左侧 Error 条；选中时信号底让位给选中片，左条保留。
- 过滤栏：级别含以上 / Tag / 关键字检索（放大镜图标 + 「清除」；过滤生效时检索框 accent 边框）+ 会话 scope 用 `YoBadge tone=accent`；控件走 `--yohu-control-height`。
- 会话 Tab：标题 + 采集绿点/信号红点 + 关闭 × + 新建 +；Tab 溢出可横向滚动；右键菜单（关闭其他/重命名/复制会话）走 `logs.tab` 场景。
- 日志行：右键走 `logs.row`（复制选中行；未选中则先选该行）。与 Ctrl+C 同一 `copyLogText`。禁止在本页再挂 `YoContextMenu`。
- 新建窗口：设备走 `YoSelect block`（触发钮显示选中设备，菜单独立定位层 Portal；禁止芯片/空触发钮）；划分用 `YoSegmentedButton`（包名 / PID，无左侧标题；高度走 `--yohu-segment-single`）。
- 状态行：`采集指示（绿点/灰点）· 设备 · 缓冲 n · 可见 n · 信号 n · 进程索引 n s 前 · 滞后回补提示`。
- 空态：未采集 → 插画图标 + 「点击开始采集」主按钮；采集中空 → 等待输出；过滤无命中 → 「无匹配日志，调整过滤条件」。
- **采集可见性**：点「开始」先清空 UI 镜像与可见区，core 同步 `ring.clear()`，只展示启动之后的 logcat；失败 toast 出错误。
- **导出**：设置项 `export.default_path` / `export.ask_every_time` / `export.write_mode`（覆盖|续写）。

### 4.2 ADB 命令终端

- 布局：内容区顶部模块页眉（标题 + 选中设备名 + 执行/清屏/命令管理）→ 左侧命令库 `YoPanel` + 右侧结果 `YoPanel`（间距 12vp）。
- 命令库树：组节点加命令数徽章；点击组行或展开箭头即选中该组；选中/hover 走 `.yohu-interactive`。
- **命令管理**：`YoDialog` 定高三栏。列表项同样走 `.yohu-interactive`，禁止自写圆角底。
- 结果区为结构化卡片列表；设备维度分组；结果区标题栏与模块功能栏均可「清屏」（只清 UI 结果，不影响命令库）。

### 4.3 文件管理

- 布局：内容区顶部模块页眉（标题 + 选中设备名 + 上传/下载/刷新/预览）→ `YoPanel` 资源分区（路径栏 | 四列清单）与独立预览 `YoPanel` 并列 → 有任务时另起传输 `YoPanel`。
- 四列清单：`YoVirtualList` 选择模式（含 ripple 与多选邻接圆角）。表头走 `YoColHeader`（轨道 + 分割线 + 前三列 `YoColResizer`）；排序钮铺满列格，走 `.yohu-interactive`（宿主 padding 0）。悬浮片铺满列矩形（inset 0 / radius-none）；「名称」左缘由首列 `--yohu-col-header-content-pad`（写在 `.yohu-col-header__label`）与行内 `.yohu-files__name` 左垫对齐，不靠行容器左右 padding，也不靠 button 宿主 padding。行间 hairline 走 VirtualList 单源（`--yohu-border`）；表头与清单背板 `--yohu-canvas`（与面板 surface 分层）；选中宿主保持透明。清单视口与日志相同：`overflow: hidden` 给虚拟列表确定高度。禁止模块再写 `.yohu-virtual-list__row` 分割线。
- 面包屑：祖先 `--yohu-fg-2`，当前段 `--yohu-fg` + semibold（不是全段 accent，也不是选中实底）；ripple 圆角覆盖为 `radius-xs`。路径栏与清单之间不拉分割线。
- 预览是独立 `YoPanel`（宽 `--yohu-layout-preview`），不嵌进清单卡片；右键走 `files.list` 场景（新建/下载/复制路径/删除），由壳 `YoContextMenuHost` 呈现。

### 4.4 投屏显示

- 与效率型模块同一 `YoPage` + `YoChrome title="投屏显示"` + `deviceLabel`。画面在 `YoPanel variant=pane` 内等比适应（`max-width/height: 100%`），不是编码器 `max_size`。
- 空态只写状态（未选择设备 / 未开始 / 启动中 / 启动失败），不把模块名再写一遍。
- 页眉：开始/停止、暂停画面、截图、面板内全屏、质量下拉（`max_size`/码率/帧率，**下次开始生效**）、只读（即时关控制；开控制需重启会话）与强制转发开关、导航键。控制关闭时导航键禁用。

### 4.5 设置

- 页壳不滚动；`YoChrome` 钉在内容区顶部。分组卡片放进 `.yohu-settings__body` 滚动；`YoPanel` 不裁切表单项。
- 页眉与卡片左缘共用 `--yohu-layout-page-margin`（PC 40vp）；页宽 `--yohu-layout-settings-max` 只约束滚动列，不把标题挤进 920 列。
- 表单项同一行：标签 + 生效徽章靠左，功能控件靠右 hug（`.yohu-settings__item-control` + `margin-left: auto`）。开关 / 数字 / 下拉 / 多选复选共用该槽，禁止某一项整行左起铺开。说明文字（`.yohu-settings__item-hint`）独占下一行。
- 文件位置项（ADB 路径 / 数据目录 / 默认导出路径）统一：只读展示框显示绝对路径 + 「浏览」；展示框宽 ≤ `--yohu-layout-settings-control-max`，超长折叠中间（目录头 ellipsis、末段完整）。空值显示 `system.info` 解析路径。数字/下拉仍走 `YoTextField`/`YoSelect`。
- **关于**：末张分组卡片。应用图标（与安装包同源）+ 展示名 + 定位；版本 / 标识 / 版权；数据根、设置目录、应用日志只读路径 + 「打开」（`system.openPath`）。禁止再写死版本号。
- 日志显示列：多选走 `YoCheckbox`（不是启用开关），控件组靠右 hug、过窄时组内折行；消息列始终显示、不提供开关。立即生效。
- `YoDialog`：中性 10% 遮罩 + `--yohu-shadow-dialog`（失焦 `-unfocused`）；最大宽 400、高 90%；标题 Title_S Bold；电脑小圆角 `radius-sm`。最小 360×240 仅适用于独立子窗口，不套浮层。
- `YoToast`：描边；最大宽 400；展示 ≤ `--yohu-dur-toast`（3s）。

---

## 5. 组件可达性基准（对齐 Kobalte 交互模型，自研实现）

| 组件 | 键盘 | ARIA |
|------|------|------|
| YoDialog | Esc 关；焦点陷阱；打开后聚焦面板；关闭后还原焦点 | `role=dialog aria-modal` |
| YoTabs | ←/→ 切换；Home/End；Delete 关闭（可关时）；Ctrl+Tab 循环 | `role=tablist/tab/tabpanel` |
| YoSelect | 展开后 ↑/↓ 选项；Enter 选；Esc 关；Portal 上下展开；宽 hug（min=触发钮）；仅超出才纵向滚动 | `aria-haspopup=listbox aria-expanded aria-activedescendant` |
| YoTree | ↑/↓ 移动；→ 展开/← 收起；Enter 选中 | `role=tree/treeitem aria-expanded` |
| YoVirtualList | 选择模式：roving tabindex + ↑/↓/Home/End/Enter/Space | 选择模式 `role=listbox/option` + `aria-selected` |
| YoContextMenu | Esc 关闭；点击项执行；点击外部关闭 | `role=menu/menuitem` |
| YoContextMenuHost | 应用根唯一实例；Portal 到 body；同时只开一个场景 | 同 YoContextMenu |
| YoIconButton | 激活执行；`loading` 时不可激活 | `aria-label`（title）+ `aria-busy` |
| YoSegmentedButton | ←/→/↑/↓ 循环选中；Home/End 首尾 | `role=radiogroup/radio` + `aria-checked` |

---

## 6. 实施顺序（与代码质量门禁绑定）

| 阶段 | 内容 | 门禁 |
|------|------|------|
| **A. Token 升级** | 三层 token + 双主题语义板 + 密度/布局 + 级别板 + 动效 + 交互态 | token 单测 + 纪律 lint + 两主题对比度抽查 |
| **B. 组件打磨** | Yo 标注；`.yohu-interactive` 选中片；焦点环单源 | 组件测试全覆盖 |
| **C. 壳重绘** | 设备卡片/导航/状态栏/设置页按 §3/§4.5 | Vitest + 冒烟脚本 |
| **D. 三模块重绘** | 按 §4.1–4.3 逐模块重绘 | 模块单测 + 真机联调 |
| **E. 交互态收敛** | 全表面消费 ripple 原语；Y* 清零 | lint 圆角门禁 + 契约测试 |

每阶段独立提交；文档与实现同步更新。

---

**本文件为主规范；冲突时以本文件为准（并修订本文件）。**
