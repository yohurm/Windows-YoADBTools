# Yohu ADB Tools — UI 设计系统规范（Slint 版）

> **状态：** 设计定稿（随 Slint UI 接入落地）  
> **调研依据：** HarmonyOS 开发者文档设计规范（本地 `HarmonyOS-Developer-docs`：`设计/设计指南/针对多设备设计/电脑/{设计概述,应用设计,窗口框架}`、`通用设计基础/{布局,视觉风格/文本排版,间隔参数}`、`应用 UX 体验标准/电脑应用 UX 体验标准`，提炼见 `docs/architecture/harmonyos-design-notes.md`）、Evil Martians《Devs in mind 2025》、Fluent 2（密度/排版）、Mirafold（语义 token 体系）、Kobalte（无头可及性交互模型）、业界日志查看器实践。  
> **执行载体：** 自研 Slint 组件集（`Yo*`，`.slint` 组件 + Rust 绑定）+ 壳（`yohu-app`）+ 三模块（终端/文件/日志）。设计变更须同步更新本文件。  
> **历史：** 早期 Web 前端时代（v1.1–v1.40）曾以 CSS 实现本文规范并持续修订；其迭代决策已合入本文正文。`feat/rust-slint` 切换后按 Slint 机制对齐（token 用 Slint 常量，交互用 Slint 属性/回调，动效见 `docs/architecture/动画系统-slint.md`）。

---

## 1. 设计原则（8 条，评估一切 UI 决策的标尺）

| # | 原则 | 落地含义 |
|---|------|----------|
| P1 | **为产线密度而设计** | 默认 comfortable（鸿蒙 PC 正文 14vp）；compact 仍可选作产线收敛，日志行不拉到手机 48vp |
| P2 | **键盘优先** | 所有高频操作有快捷键；组件完整键盘可达（Tab 导航 + 方向键 + Esc 层级退出） |
| P3 | **数据用等宽字体** | serial/PID/时间/日志正文/文件大小一律等宽 + 数字列对齐 |
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
Semantic（语义别名：Fg / Surface / Accent / Success…，主题相关）
   ↓
Component（组件级：State-* / Level-* / Ripple-* / Focus-*，唯一被组件消费）
```

- Slint 承载：`token/` 下 `.slint` 常量 + 导出 struct（`Colors`/`Typography`/`Spacing`/`Density`…），经组件树属性注入；组件与模块只引用 Semantic/Component 层。
- **主题切换 = 切换 Semantic 层常量**（`light`/`dark` 两套 + `system` 跟随系统），零运行时成本。
- **纪律检查**（自定义 lint / Slint LSP 扫描）：组件外零硬编码色值/字号/动效时长/裸圆角。

### 2.0 组件标注

- **公开组件名**一律 `Yo` 前缀：`YoButton`、`YoVirtualList`、`YoTabs`…。禁止 `YButton` 这类单字母前缀。
- **Token 命名空间**保持产品前缀 `yohu-*`（如 `yohu-accent`）。组件名 ≠ token 前缀。
- 新增组件必须同时：`.slint` 组件文件 + token 引用 + 本文件登记。

### 2.1 色彩系统（HarmonyOS NEXT 官方 Token）

Primitive 层 = 鸿蒙系统 Token 原值（ARGB → `#RRGGBB` / `#RRGGBBAA`）。深色 `background_primary` 以文档正文为准（黑），不用表内 `#E5E5E5`。

| Token | 鸿蒙 Token | Light | Dark | 用途 |
|-------|------------|-------|------|------|
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
| `level-v` | `font_tertiary` | 黑 40% | 白 40% |
| `level-d` | `brand` | `#0A59F7` | `#317AF7` |
| `level-i` | `confirm` | `#64BB5C` | `#5BA854` |
| `level-w` | `alert` | `#ED6F21` | `#DB6B42` |
| `level-e` | `warning` | `#E84026` | `#D94838` |
| `level-f` | `font_on` on `warning` | `#FFFFFF` on `#E84026` | `#FFFFFF` on `#D94838` |

### 2.2 排版

- 界面字体：`"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif`
- 数据/等宽：`"Cascadia Mono", Consolas, "Courier New", monospace`（数字列对齐）
- 字号阶梯（默认 = 鸿蒙 PC）：Caption_M 10 / Caption 12 / Body 14 / BodyStrong 14 / Subtitle_M 14 / Subtitle 16 / Title_S 18；**compact 覆盖** 10 / 11 / 12.5 / 13.5 / 13 / 15 / 18
- 字重：Light 300 / Regular 400 / Medium 500 / Semibold 600 / Bold 700（Title Bold、Subtitle Medium、Body Regular）
- 行高：`leading-tight: 1.25`（铬条/标题）/ `ui: 1.55`（正文）/ `data: 1.4`（日志/serial）
- 根节点：Body + leading-ui + 行首标点禁则

### 2.3 密度与布局

控件/行高走密度变量，布局宽走 `Layout-*`，禁止在组件或模块里写第二套数字。

| Token | compact | comfortable（默认） | 用途 |
|-------|---------|---------------------|------|
| `control-height` | 26 | 32 | 按钮/输入/图标钮/路径栏 |
| `control-height-sm` | 24 | 28 | 小按钮 |
| `row-height` | 22 | 26 | 日志/文件数据行 |
| `row-height-device` | 34 | 40 | 设备卡片 |
| `row-height-nav` | 32 | 36 | 导航项 |
| `row-height-header` | 28 | 32 | 表头 |
| `segment-single` | 28 | 40 | 分段按钮单行（V2 `singleline_background_height` / V1 最小 28） |
| `segment-hybrid` | 44 | 56 | 分段按钮图文（V2 `doubleline_background_height`） |
| `title-bar-height` | 40 | 40 | 窗口铬（HarmonyOS Compact；不随内容密度抬到 56） |

布局常量（不随密度变）：`layout-shell-nav: 232px`、`layout-sidebar: 280px`、`layout-preview: 240px`、`layout-settings-max: 920px`、`layout-output-max: 260px`、`layout-hit-splitter: 6px`、`layout-gutter: 16px`、`layout-grid-max: 2220px`、`layout-page-inset` / `layout-page-gap`（数值 = `Spacing.Md` 12vp，经 `YoPage` 消费）、`layout-chrome-pad`（数值 = `Spacing.Sm` 8vp，经 `YoChrome` 消费）。

HarmonyOS 电脑/大屏补齐：`layout-window-default-w/h: 1200×800`、`layout-window-min-w/h: 360×240`、`layout-page-margin: 40px`（PC 左右边距，设置页用）、`layout-breakpoint-split: 600`（分栏）、`layout-breakpoint-side: 840`（侧边页签）、`layout-button-max: 448`、`layout-dialog-max: 400`。数量约束 `LayoutLimits`：标题栏右侧 ≤3 图标、C 栏工具栏 ≤6、侧栏 ≤窗口宽 40%。间距补 `space-2xl=32`、`space-3xl=40`（Padding_level16/20）。控件行高仍按 P1 产线密度收敛，不改用手机 48vp 列表行。

效率型工作台：内容区从窗口标题栏下方**贴边**排布；模块页眉与分区的内边距由 `YoPage` 承担（`page-inset` / `page-gap`）。设置页才用 `page-margin` 40vp。

描边宽：`stroke-hairline: 1px`、`stroke-accent: 2px`（焦点/左边条/Tab 指示）、`stroke-emphasis: 3px`（级别条/结果卡强调）。

### 2.4 动效

- 时长分级（HarmonyOS）：`dur-fast: 100ms`（hover/按下）、`dur-small: 150ms`（小范围）、`dur-normal: 160ms`（面板/下拉）、`dur-local: 200ms`（局部删除）、`dur-slow: 300ms`（页面级）、`dur-enter: 350ms`（入场）、`dur-progress: 400ms`（进度最短感知）、`dur-toast: 3s`；循环指示：`dur-loop: 800ms`、`dur-loop-slow: 1.2s`
- 缓动：`ease-standard: cubic-bezier(0.4,0,0.2,1)`（标准）、`ease-decel: cubic-bezier(0,0,0.4,1)`（减速）、`ease-loop: ease-in-out`（循环）
- 完整行为（Presence / Collapse / Rail / 配方目录 / 虚拟列表禁动）以 `docs/architecture/动画系统-slint.md` 为准，本节只登记 token 数字
- 用途克制：下拉展开/淡入淡出；**日志列表选中片无过渡**（性能优先）
- **加载循环**：`YoIconButton loading` 给图标加旋转动画（`dur-loop` 线性）；加载期间按钮 `disabled`。设备栏刷新、文件刷新等长操作必须走该入口，禁止模块自写 spinner。

### 2.5 图标

- **应用品牌图标**：`app/yohu-app/icons/icon.png`（1024，圆角矩形底板 + 透明四角，宇宙蓝）+ `icon.ico`。标题栏 / 关于走应用位图（`YoTitleBar.logoSrc`）；展示时不再二次裁圆角。禁止用模块字形（如 `terminal`）冒充应用图标。
- **唯一入口**：`Icon` 组件（名称/尺寸）；模块注册表 `icon: IconName`；工具栏用 `YoIconButton`（内部仍走 `Icon`）。
- **文件类型图标**：`YoFileIcon`（SVG 资源工厂）。模块禁止内联文件 SVG；色值只允许出现在该组件资源内。
- **禁止**：模块内再写一份 SVG、emoji 当图标。
- **风格**：24×24 viewBox、描边 2、`currentColor`；`play`/`pause` 实心。新增通用图标只改图标资源表。

### 2.6 圆角阶梯

| Token | 值 | 用途 |
|-------|----|------|
| `radius-2xs` | 2px | 微标（Fatal 块、检索高亮） |
| `radius-xs` | 4px | 面包屑级小控件 |
| `radius-sm` | 8px | 按钮/输入/列表 ripple / 导航片 |
| `radius-md` | 16px | 卡片/面板/对话框 |
| `radius-lg` | 20px | 大卡片 |
| `radius-xl` | 32px | 顶层浮层 |
| `radius-full` | 50% | 正圆（状态点/spinner） |
| `radius-pill` | 999px | 胶囊（徽章） |

组件禁止写裸圆角。

### 2.7 交互态与选中 Ripple（单源）

列表行、树行、下拉选项、菜单项、导航项、命令管理项、表头排序 **共用同一配方**，禁止各文件再写 `background: accent-soft` / `nav-hover`。

**状态色（Component 层）**

| Token | 算法 | 用途 |
|-------|------|------|
| `state-hover` | `interactive_hover`：中性 5%（浅黑/深白） | 悬浮 / 键盘活动 |
| `state-pressed` | `interactive_pressed`：中性 10% | 按压 |
| `state-selected` | `interactive_active` = `accent` | 选中实底（侧栏/树/命令/列表同一源） |
| `state-selected-fg` | `font_on_primary` = `fg-on` | 选中行文字/图标 |
| `accent-soft` | `comp_emphasize_secondary`（品牌 20%） | 徽章/范围芯片，禁止当选中底 |

**几何（可在子树覆盖，不可另起炉灶）**

| Token | 默认 | 含义 |
|-------|------|------|
| `ripple-radius` | `radius-sm` | 选中片圆角 |
| `ripple-inset` | 0 | 铺满行盒；距背板 = 容器 padding |

**载体**：`YoInteractive` 行为基元（Slint 组件/回调）。选中只用 `state-selected`；键盘活动用 `state-hover`。单选实底由 `YoIndicator` 在项之间滑动；虚拟列表与多选块仍是每项独立选中片。

- 实心底控件（`YoButton` / `YoCheckbox` / `YoSegmentedButton`）走变体色 + `accent-hover/pressed`，不走列表 ripple。
- `YoSegmentedButton` 对齐 SegmentButtonV2：默认 tab 白选择块（`surface` + `shadow-xs` + `fg`），capsule 才用 accent + `fg-on`。背板/选择块 `radius-xl`（32vp）。不作一级导航、不承载删除/添加。
- `YoTabs` 激活指示是 `YoIndicator` underline（底边 `stroke-accent` 滑块），hover 仍走 ripple；不要把 Tab 激活画成选中填充。
- 语义色逃生：`YoBadge`（徽章）与级别色（日志级别 / 检索高亮）在选中行内保持自身色。
- 选中宿主必须透明底：自绘背景会盖住选中片。
- 禁止再挂表面双份选中态（树/下拉/列表各自实现的选中样式）。
- **多选邻接圆角（VirtualList / 文件清单 / 日志）**：`adjacentJoin` 判断上下行是否同属选中块（`start` 削底角 / `mid` 四角皆直 / `end` 削顶角；孤立选中四角 `ripple-radius`）。邻接缝用 `state-selected` 补色。禁止模块再写一套选中圆角。

**焦点环（单源）**

- `YoFocusRing`：`focus-ring` 色 + 2px（`stroke-accent`）+ 外偏距；键盘焦点才显示（`has-focus` 且非指针激活）。
- `YoFocusHost`：焦点在内部控件时（`YoTextField` / `YoCheckbox`）。
- 禁止控件再写一套焦点环。

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

- **窗口铬**：标题栏只承担窗口铬后高度走 HarmonyOS 电脑 Compact **40vp**；三键从左到右为最小化、最大化（或还原）、关闭（跟 Windows 习惯）；侧栏钮与三键等宽 48vp、贴窗口右缘、热区铺满栏高。侧栏展开时在导航与内容区之间拉 hairline；收起侧栏时不画。
- **设备栏**：标题行 = 折叠钮 +「设备」+ 数量徽章（紧跟标题，不推到最右）+ 刷新（`YoIconButton loading` 旋转）；设备行（型号一行 + serial 等宽一行，主次上下间隔 2vp + 在线点 + 未授权徽章，无白卡片）；空态给引导文案；选中只加 `state-selected`（高亮 = 当前模块解析后的执行目标）。单选实底由 `YoIndicator` 在 list 宿主内滑动（宿主裁剪过冲；项滚动走内层滚动区，禁止把滚动区写在滑块宿主上）。MultiOptional（终端）：单击替换勾选，Ctrl/Meta+click 加减选；未勾选回退全局焦点，不把全部在线设备当作已选。
- **导航**：图标 16px（`Icon` 单源）+ 标题；激活只加 `state-selected`；Planned 项「开发中」胶囊徽章。侧栏可整栏收起（标题栏抽屉钮）。
- **模块页眉**：`YoChrome`。左侧为功能标题区（Subtitle Bold）+ 选中设备名（`deviceLabel` 中性徽章，来自 `DeviceSession.selectedLabel`），右侧为功能栏。无操作的模块（设置/投屏）只显示标题，但标题行高度仍是 `control-height`。底垫 `layout-chrome-pad`。页眉是页壳的第一子节点，禁止与内容区并列。
- **模块页壳**：效率型与占位模块（终端/文件/日志/投屏）根节点一律 `YoPage`（`layout-page-inset` 内边距、`layout-page-gap` 间距）。`YoChrome` 是第一子节点。内容进 `YoPanel`（`pane` 撑满）。禁止模块再写一套页垫。空态文案不得复写页眉模块名。设置页分组走 `YoPanel` 默认 card，边距仍是 `page-margin`。
- **通铺与分区**：窗口 canvas 通铺；标题栏与工作区、状态栏不拉结构分割线。模块分区 = `YoPanel`（surface + radius-md + hairline 描边 + XS 阴影）。分割线还用于：页签指示、表头/列、数据行、对话框头尾、输入类控件。路径栏与清单靠 canvas 分层，不另拉线。
- **状态栏**：左「展示名 v版本」（`system.info.identity`）/ 中留白 / 右「设备 · 任务 · 状态」；任务悬停显示明细（`TaskInfo.detail`）。透明贴合 canvas。Caption + leading-tight。
- **对话框**：Title_S Bold；PC 小圆角 `radius-sm`；宽 ≤400、高 ≤90%；**不要**把窗口最小 360×240 套到浮层确认框。
- **快捷键统一表**：`Ctrl+K` 命令面板（模块跳转/刷新设备/开始采集…）；模块内快捷键不变。

---

## 4. 模块 UI 规范

### 4.1 日志分析（核心打磨对象）

- 布局：内容区顶部模块页眉（标题 + 选中设备名 + 采集操作）→ 会话 Tab（canvas 上）→ `YoPanel` 会话分区（过滤 / **固定表头** + 虚拟列表 / 状态行）。
- 行结构（列对齐，等宽，**定宽列布局**）：`[时间 18ch] [UID 10ch] [PID 6ch] [TID 6ch] [级别 4ch] [Tag 24ch] [消息 →]`。UID 来自 `logcat -v threadtime,uid`（数字或 `root`/`shell`/`wifi` 名）。禁止消息列左右错位。解析失败（level=`?`）整行消息通栏，禁止画 `0 ?` 假列。级别用色字 + `stroke-emphasis` 左条；Fatal 反色块（`radius-2xs`）；行选中由 `YoVirtualList` 承担，模块禁止再写行 hover 底。行间 hairline 走 VirtualList 单源。
- **固定表头**：列名钉在滚动区外，与行共用列轨道；高度 `row-height-header`；背板 canvas。无排序、无列宽拖拽，禁止改走 `YoColHeader`。显示列读壳注入的 `DeviceSession.settings.log_display_columns`（消息始终在），列轨道按可见列生成。禁止模块再 `settings.get`。
- 信号行（崩溃/ANR）行底色 `signal-bg` + 左侧 Error 条；选中时信号底让位给选中片，左条保留。
- 过滤栏：级别含以上 / Tag / 关键字检索（放大镜图标 + 「清除」；过滤生效时检索框 accent 边框）+ 会话 scope 用 `YoBadge tone=accent`；控件走 `control-height`。
- 会话 Tab：标题 + 采集绿点/信号红点 + 关闭 × + 新建 +；Tab 溢出可横向滚动；右键菜单（关闭其他/重命名/复制会话）走 `logs.tab` 场景。
- 日志行：右键走 `logs.row`（复制选中行；未选中则先选该行）。与 Ctrl+C 同一 `copyLogText`。禁止在本页再挂菜单宿主。
- 新建窗口：设备走 `YoSelect block`（触发钮显示选中设备，菜单独立定位层）；划分用 `YoSegmentedButton`（包名 / PID，无左侧标题；高度走 `segment-single`）。
- 状态行：`采集指示（绿点/灰点）· 设备 · 缓冲 n · 可见 n · 信号 n · 进程索引 n s 前 · 滞后回补提示`。
- 空态：未采集 → 插画图标 + 「点击开始采集」主按钮；采集中空 → 等待输出；过滤无命中 → 「无匹配日志，调整过滤条件」。
- **采集可见性**：点「开始」先清空 UI 镜像与可见区，core 同步 `ring.clear()`，只展示启动之后的 logcat；失败 toast 出错误。
- **导出**：设置项 `export.default_path` / `export.ask_every_time` / `export.write_mode`（覆盖|续写）。

### 4.2 ADB 命令终端

- 布局：内容区顶部模块页眉（标题 + 选中设备名 + 执行/清屏/命令管理）→ 左侧命令库 `YoPanel` + 右侧结果 `YoPanel`（间距 12vp）。
- 命令库树：组节点加命令数徽章；点击组行或展开箭头即选中该组；选中/hover 走 `YoInteractive`。
- **命令管理**：`YoDialog` 定高三栏。列表项同样走 `YoInteractive`，禁止自写圆角底。
- 结果区为结构化卡片列表（设备维度分组、组头汇总徽章、折叠输出区失败默认展开、用时走 core `duration_ms`）；结果区标题栏与模块功能栏均可「清屏」（只清 UI 结果，不影响命令库）。

### 4.3 文件管理

- 布局：内容区顶部模块页眉（标题 + 选中设备名 + 上传/下载/刷新/预览）→ `YoPanel` 资源分区（路径栏 | 四列清单）与独立预览 `YoPanel` 并列 → 有任务时另起传输 `YoPanel`。
- 四列清单：`YoVirtualList` 选择模式（含 ripple 与多选邻接圆角）。表头走 `YoColHeader`（轨道 + 分割线 + 前三列 `YoColResizer`）；排序钮铺满列格，走 `YoInteractive`。悬浮片铺满列矩形；「名称」左缘与行内 `YoFileIcon` 左垫对齐，不靠行容器左右 padding。行间 hairline 走 VirtualList 单源；表头与清单背板 canvas（与面板 surface 分层）；选中宿主保持透明。清单视口裁剪给虚拟列表确定高度。禁止模块再写行分割线。
- 面包屑：祖先 `fg-2`，当前段 `fg` + semibold（不是全段 accent，也不是选中实底）；ripple 圆角覆盖为 `radius-xs`。路径栏与清单之间不拉分割线。
- 预览是独立 `YoPanel`（宽 `layout-preview`），不嵌进清单卡片；右键走 `files.list` 场景（新建/下载/复制路径/删除），由壳 `YoContextMenuHost` 呈现。
- 传输卡片：方向图标/速度采样/终态 3s 淡出自动移除（动效见 `动画系统-slint.md`）。

### 4.4 投屏显示（Planned）

- 与效率型模块同一 `YoPage` + `YoChrome title="投屏显示"`。空态只写状态（「模块开发中」），不把模块名再写一遍。

### 4.5 设置

- 页壳不滚动；`YoChrome` 钉在内容区顶部。分组卡片进 `YoPanel`；`YoPanel` 不裁切表单项。
- 页眉与卡片左缘共用 `layout-page-margin`（PC 40vp）；页宽 `layout-settings-max` 只约束滚动列，不把标题挤进 920 列。
- 表单项同一行：标签 + 生效徽章靠左，功能控件靠右 hug；开关 / 数字 / 下拉 / 多选复选共用该槽，禁止某一项整行左起铺开。说明文字独占下一行。
- 文件位置项（ADB 路径 / 数据目录 / 默认导出路径）统一：只读展示框显示绝对路径 + 「浏览」；展示框宽 ≤ `layout-settings-control-max`，超长折叠中间（目录头 ellipsis、末段完整）。空值显示 `system.info` 解析路径。
- **关于**：末张分组卡片。应用图标（与安装包同源）+ 展示名 + 定位；版本 / 标识 / 版权；数据根、设置目录、应用日志只读路径 + 「打开」（`system.openPath`）。禁止再写死版本号。
- 日志显示列：多选走 `YoCheckbox`（不是启用开关），控件组靠右 hug、过窄时组内折行；消息列始终显示、不提供开关。立即生效。
- `YoDialog`：中性 10% 遮罩 + 阴影（失焦 `-unfocused`）；最大宽 400、高 90%；标题 Title_S Bold；电脑小圆角 `radius-sm`。最小 360×240 仅适用于独立子窗口，不套浮层。
- `YoToast`：描边；最大宽 400；展示 ≤ 3s。

---

## 5. 组件可达性基准（对齐 Kobalte 交互模型，自研实现）

| 组件 | 键盘 | 语义 |
|------|------|------|
| YoDialog | Esc 关；焦点陷阱；打开后聚焦面板；关闭后还原焦点 | `accessible-role=dialog` |
| YoTabs | ←/→ 切换；Home/End；Delete 关闭（可关时）；Ctrl+Tab 循环 | tablist/tab/tabpanel |
| YoSelect | 展开后 ↑/↓ 选项；Enter 选；Esc 关；上下展开；宽 hug（min=触发钮）；仅超出才纵向滚动 | listbox/option + 展开态 |
| YoTree | ↑/↓ 移动；→ 展开/← 收起；Enter 选中 | tree/treeitem + 展开态 |
| YoVirtualList | 选择模式：roving tabindex + ↑/↓/Home/End/Enter/Space | 选择模式 listbox/option + 选中态 |
| YoContextMenu | Esc 关闭；点击项执行；点击外部关闭 | menu/menuitem |
| YoContextMenuHost | 应用根唯一实例；同时只开一个场景 | 同 YoContextMenu |
| YoIconButton | 激活执行；`loading` 时不可激活 | `accessible-label`（title）+ busy |
| YoSegmentedButton | ←/→/↑/↓ 循环选中；Home/End 首尾 | radiogroup/radio + checked |

---

## 6. 实施顺序（随 Slint UI 接入落地）

| 阶段 | 内容 | 门禁 |
|------|------|------|
| **A. Token 层** | 三层 token + 双主题语义板 + 密度/布局 + 级别板 + 动效 + 交互态 | token 单测 + 纪律 lint + 两主题对比度抽查 |
| **B. 组件打磨** | Yo 标注；`YoInteractive` 选中片；焦点环单源 | 组件测试全覆盖（cargo test + slint-testing） |
| **C. 壳实现** | 窗口铬/设备栏/导航/页眉/状态栏/设置页按 §3/§4.5 | 组件测试 + 冒烟脚本 |
| **D. 三模块实现** | 按 §4.1–4.3 逐模块接入 | 模块单测 + 真机联调 |
| **E. 交互态收敛** | 全表面消费 `YoInteractive` 原语；Y* 清零 | lint 圆角门禁 + 契约测试 |

每阶段独立提交；文档与实现同步更新。

---

**本文件为主规范；冲突时以本文件为准（并修订本文件）。**
