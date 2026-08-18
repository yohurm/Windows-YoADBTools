# Yohu ADB Tools v6 — UI 设计系统规范（UI 打磨单一事实源）

> **状态：** v1.4（2026-08-18，theme.css 由 TS 生成 + Theme=system + 焦点环单载体）  
> **调研依据：** HarmonyOS 开发者文档设计规范（详见 `docs/architecture/harmonyos-design-notes.md`：宇宙蓝/圆角阶梯/时长分级/标准缓动）、Evil Martians《Devs in mind 2025》、Fluent 2（密度/排版）、Mirafold（语义 token 体系）、Kobalte（无头可及性交互模型）、业界日志查看器实践。  
> **执行载体：** `@yohu/ui`（token 单源 + 组件）+ `@yohu/app`（壳）+ `@yohu/modules/*`（三模块）。所有改动必须同步更新本文件。
>
> **v1.1 变更（HarmonyOS 融合）**：主强调色 → 宇宙蓝 `#0A59F7`（浅）/`#4C8DFF`（深）；语义色对齐鸿蒙（浅色取深色变体以保正文对比度 ≥4.5:1，由 WCAG 门禁测试强制）；圆角阶梯 → 4/8/16/20/32；动效 → 鸿蒙时长分级 100/160/300/350ms + 标准曲线 `cubic-bezier(0.4,0,0.2,1)`/减速 `(0,0,0.4,1)`。PC 桌面端遵循鸿蒙「PC 小 2vp、8vp 网格」原则做密度收敛。
>
> **v1.2 变更（底向上布局）**：设备数徽章紧跟「设备」标题；`YoIconButton.loading` 走 `--yohu-dur-loop` 旋转；设置页两列网格 + 页面滚动（面板不裁切）；文件管理改为资源管理器四列 + 可收起预览 + `YoContextMenu`/`YoFileIcon`；命令管理三栏；日志采集从开始时刻清空缓冲并出流。
>
> **v1.3 变更（交互态架构）**：公开组件统一 `Yo*` 标注（禁止 `Y*`）；CSS/token 命名空间保持 `yohu-*`。补齐交互态 / ripple / 焦点 / 布局 token；列表·树·菜单·导航·命令管理共用 `.yohu-interactive` 选中片（`radius-sm` + `inset space-xs`），禁止各表面自写选中底与裸圆角。圆角阶梯补 `2xs`/`full`/`pill`；间距补 `2xs`。纪律 lint 拦截裸 `border-radius`。
>
> **v1.4 变更（token 单源闭环）**：`theme.css` 由 `tokens/emit-theme.ts` 从 TS 常量排出（契约测试强制磁盘文件一致）；包导出 `@yohu/ui/theme.css` 绑定 `theme + states`。协议 `Theme` 增加 `system` 且默认跟随系统（P7）。选中填充只用 `.yohu-interactive--selected`（不用 `aria-selected`，以免 Tabs 下划线被画成实底）。焦点环补 `.yohu-focus-host`（焦点在内部控件时）。`YoCheckbox` 改原生 `input[type=checkbox]`。

---

## 1. 设计原则（8 条，评估一切 UI 决策的标尺）

| # | 原则 | 落地含义 |
|---|------|----------|
| P1 | **为产线密度而设计** | 信息密度优先于留白；默认 compact 密度；一屏内可见更多日志/命令/文件 |
| P2 | **键盘优先** | 所有高频操作有快捷键；组件完整键盘可达（Tab 导航 + 方向键 + Esc 层级退出） |
| P3 | **数据用等宽字体** | serial/PID/时间/日志正文/文件大小一律等宽 + `tabular-nums` 列对齐 |
| P4 | **语义色先行** | 颜色只表达语义（在线/通过/失败/警告/级别），装饰色不喧宾夺主 |
| P5 | **对比度达标** | 正文/次要文本对比 ≥ 4.5:1 / 3:1；级别色在深浅两主题下均可达标 |
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

### 2.1 色彩系统（语义板）

| 语义 | Light | Dark | 用途 |
|------|-------|------|------|
| `--yohu-bg-base` | `#F5F6F8` | `#17181C` | 窗口底色 |
| `--yohu-surface` | `#FFFFFF` | `#1F2127` | 面板/卡片 |
| `--yohu-surface-2` | `#F0F2F5` | `#262930` | 次级表面（列表头/输入底） |
| `--yohu-fg` | `#1B1D22` | `#E8EAEF` | 主文本 |
| `--yohu-fg-2` | `#565D68` | `#A6ADBB` | 次要文本 |
| `--yohu-fg-3` | `#8A919C` | `#6E7686` | 弱化文本/占位 |
| `--yohu-border` | `#D9DEE6` | `#333844` | 常规边框 |
| `--yohu-border-strong` | `#B7BFCB` | `#454B58` | 强调边框/分割 |
| `--yohu-accent` | `#0A59F7` | `#4C8DFF` | 主强调 |
| `--yohu-accent-soft` | `#D9E7FF` | `#22365E` | 选中实底（= `--yohu-state-selected`） |
| `--yohu-accent-hover` | `#094DDB` | `#6AA3FF` | 实心主按钮 hover |
| `--yohu-accent-pressed` | `#0740C4` | `#8BB4FF` | 实心主按钮 pressed |
| `--yohu-success` | `#2C7A38` | `#64BB5C` | 在线/通过 |
| `--yohu-warn` | `#A35200` | `#ED6F21` | 警告/执行中 |
| `--yohu-error` | `#CC2B1B` | `#F06A5A` | 失败/崩溃 |
| `--yohu-offline` | `#8A919C` | `#6E7686` | 离线/禁用 |
| `--yohu-focus-ring` | `rgba(10,89,247,.45)` | `rgba(76,141,255,.5)` | 键盘焦点环色 |

**logcat 级别专用板（Component 层，双主题各一组）：**

| 级别 | Light | Dark | 语义 |
|------|-------|------|------|
| `--yohu-level-v` | `#6E7686` | `#8A93A6` | Verbose（弱） |
| `--yohu-level-d` | `#3D6E9E` | `#7FA8CE` | Debug（蓝） |
| `--yohu-level-i` | `#1F7A33` | `#57B96B` | Info（绿） |
| `--yohu-level-w` | `#9A6A00` | `#D9A43C` | Warn（琥珀） |
| `--yohu-level-e` | `#C22929` | `#E86A6A` | Error（红） |
| `--yohu-level-f` | `#FFFFFF on #C22929` | `#1B1D22 on #E86A6A` | Fatal（反色块） |

### 2.2 排版

- 界面字体：`"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif`
- 数据/等宽：`"Cascadia Mono", Consolas, "Courier New", monospace`（`font-variant-numeric: tabular-nums`）
- 字号阶梯（compact）：Caption 11 / Body 12.5 / BodyStrong 13.5 / Subtitle 15 / Title 18；**comfortable 各 +1px**（`[data-density=comfortable]` 覆盖字号变量）
- 行高：数据行 1.4；正文 1.55

### 2.3 密度与布局

控件/行高走密度变量，布局宽走 `--yohu-layout-*`，禁止在组件或模块里写第二套数字。

| Token | compact | comfortable | 用途 |
|-------|---------|-------------|------|
| `--yohu-control-height` | 26 | 32 | 按钮/输入/图标钮/路径栏 |
| `--yohu-control-height-sm` | 24 | 28 | 小按钮 |
| `--yohu-row-height` | 22 | 26 | 日志/文件数据行 |
| `--yohu-row-height-device` | 34 | 40 | 设备卡片 |
| `--yohu-row-height-nav` | 32 | 36 | 导航项 |
| `--yohu-row-height-header` | 28 | 32 | 表头 |

布局常量（不随密度变）：`--yohu-layout-shell-nav: 232px`、`--yohu-layout-sidebar: 280px`、`--yohu-layout-preview: 240px`、`--yohu-layout-settings-max: 920px`、`--yohu-layout-output-max: 260px`、`--yohu-layout-hit-splitter: 6px`。

描边宽：`--yohu-stroke-hairline: 1px`、`--yohu-stroke-accent: 2px`（焦点/左边条/Tab 指示）、`--yohu-stroke-emphasis: 3px`（级别条/结果卡强调）。

### 2.4 动效

- 时长分级（HarmonyOS）：`--yohu-dur-fast: 100ms`（hover/按下）、`--yohu-dur-normal: 160ms`（面板/下拉）、`--yohu-dur-slow: 300ms`（页面级）、`--yohu-dur-enter: 350ms`（入场/退场）；循环指示：`--yohu-dur-loop: 800ms`（spinner）、`--yohu-dur-loop-slow: 1.2s`（不确定进度条扫动）
- 缓动：`--yohu-ease-standard: cubic-bezier(0.4,0,0.2,1)`（标准）、`--yohu-ease-decel: cubic-bezier(0,0,0.4,1)`（减速）、`--yohu-ease-loop: ease-in-out`（循环）
- JS 消费侧经 `@yohu/ui` 导出 `MotionDuration` / `MotionEasing`（与 theme.css 契约测试强制一致）；动效时长硬编码由纪律 lint 拦截
- 用途克制：下拉展开/淡入淡出；**日志列表选中片无过渡**（性能优先，`.yohu-interactive` 默认无 transition）
- **加载循环**：`YoIconButton loading` 给图标加 `yohu-icon-button--loading`，按 `--yohu-dur-loop` 线性旋转；加载期间按钮 `disabled` + `aria-busy`。设备栏刷新、文件刷新等长操作必须走该入口，禁止模块自写 spinner。

### 2.5 图标

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

列表行、树行、下拉选项、菜单项、导航项、命令管理项 **共用同一配方**，禁止各文件再写 `background: accent-soft` / `nav-hover`。

**状态色（Component 层）**

| Token | 算法 | 用途 |
|-------|------|------|
| `--yohu-state-hover` | `accent` 10% 叠在透明上 | 悬浮 / 键盘活动 |
| `--yohu-state-pressed` | `accent` 16% | 按压 |
| `--yohu-state-selected` | `var(--yohu-accent-soft)` | 选中实底 |

**几何（可在子树覆盖，不可另起炉灶）**

| Token | 默认 | 含义 |
|-------|------|------|
| `--yohu-ripple-radius` | `var(--yohu-radius-sm)` | 选中片圆角 |
| `--yohu-ripple-inset` | `var(--yohu-space-xs)` | 距行盒内缩（HarmonyOS 沉浸光感 4vp） |

**载体**：`tokens/states.css` 的 `.yohu-interactive`。选中只用 `.yohu-interactive--selected`（**不要**用 `[aria-selected]` 上填充：`YoTabs` 的 `aria-selected` 表示下划线激活，不是实底选中）。键盘活动用 `.yohu-interactive--active`。

- 实心底控件（`YoButton` / `YoCheckbox`）走变体色 + `--yohu-accent-hover/pressed`，不走列表 ripple。
- 设备卡片是带边框的 surface：左边条 `--yohu-stroke-accent` + 同一 `.yohu-interactive` 选中片。
- `YoTabs` 激活指示是底边 `--yohu-stroke-accent`，hover 仍走 ripple；不要把 Tab 激活画成选中填充。
- 面包屑等小控件可在选择器内覆盖 `--yohu-ripple-radius: var(--yohu-radius-xs)`、`--yohu-ripple-inset: 0`。

**焦点环（单源）**

- `.yohu-focus-ring`：`outline: var(--yohu-focus-width) solid var(--yohu-focus-ring)` + `outline-offset: var(--yohu-focus-offset)`
- `.yohu-focus-ring--inset`：offset 用 `--yohu-focus-offset-inset`
- `.yohu-focus-host` / `--inset`：焦点在内部控件时（`focus-within:has(:focus-visible)`），用于 `YoTextField` / `YoCheckbox`
- 禁止控件再写 `outline: 2px solid var(--yohu-accent)` 或手写同一套 outline

---

## 3. 壳（Shell）规范

```
┌────────────────────────────────────────────────────────────┐
│ TitleBar（图标 + 标题 + 最小化/最大化/关闭）                  │
├──────────┬─────────────────────────────────────────────────┤
│ 设备栏    │ 模块工具栏（标题 + 操作按钮 + 模块状态）           │
│ 在线设备  │─────────────────────────────────────────────────┤
│ 卡片式    │                                                 │
│ 型号/串号 │            模块主视图                            │
│──────────│                                                 │
│ 模块导航  │                                                 │
│ 图标+标题 │                                                 │
│          │                                                 │
├──────────┴─────────────────────────────────────────────────┤
│ 状态栏：设备状态 · 后台任务 · 版本                           │
└────────────────────────────────────────────────────────────┘
```

- **设备栏**：标题行 = 折叠钮 +「设备」+ 数量徽章（徽章紧跟标题，不推到最右）+ 刷新（`YoIconButton loading` 旋转）；设备卡片（型号一行 + serial 等宽一行 + 在线点 + 未授权徽章）；空态给引导文案；选中 = `.yohu-interactive--selected` + `--yohu-stroke-accent` 左边条。
- **导航**：图标 16px（`<Icon>` 单源，currentColor）+ 标题；激活项 accent 文字 + `.yohu-interactive--selected`；Planned 项「开发中」胶囊徽章。图标节点每次渲染新建。
- **状态栏**：左版本/中留白/右「设备 · 任务 · 状态」；任务悬停显示明细。
- **快捷键统一表（v6.1 目标）**：`Ctrl+K` 命令面板（模块跳转/刷新设备/开始采集…）；模块内快捷键不变。

---

## 4. 模块 UI 规范

### 4.1 日志分析（核心打磨对象）

- 布局：工具栏 → 会话 Tab 栏 → 过滤栏（单行） → 虚拟列表 → 会话状态行。
- 行结构（列对齐，等宽）：`[时间 18ch] [PID 6→] [级别 1] [Tag ≤24ch] [消息 →]`；级别用色字 + `--yohu-stroke-emphasis` 左条；Fatal 反色块（`radius-2xs`）；行选中由 `YoVirtualList` 的 `.yohu-interactive` 承担，模块禁止再写行 hover 底。
- 信号行（崩溃/ANR）行底色 `--yohu-signal-bg` + 左侧 Error 条。
- 过滤栏：级别含以上 / Tag / 关键字检索（放大镜图标 + 「清除」；过滤生效时检索框 accent 边框）+ 会话 scope 徽章；控件走 `--yohu-control-height`。
- 会话 Tab：标题 + 采集绿点/信号红点 + 关闭 × + 新建 +；Tab 溢出可横向滚动；右键菜单（关闭其他/重命名/复制会话）。
- 状态行：`采集指示（绿点/灰点）· 设备 · 缓冲 n · 可见 n · 信号 n · 进程索引 n s 前 · 滞后回补提示`。
- 空态：未采集 → 插画图标 + 「点击开始采集」主按钮；采集中空 → 等待输出；过滤无命中 → 「无匹配日志，调整过滤条件」。
- **采集可见性**：点「开始」先清空 UI 镜像与可见区，core 同步 `ring.clear()`，只展示启动之后的 logcat；失败 toast 出错误。
- **导出**：设置项 `export.default_path` / `export.ask_every_time` / `export.write_mode`（覆盖|续写）。

### 4.2 ADB 命令终端

- 布局：工具栏（标题 + 执行 + 命令管理）→ 左侧命令库（树，可折叠分组） → 右侧结果区。
- 命令库树：组节点加命令数徽章；点击组行或展开箭头即选中该组；选中/hover 走 `.yohu-interactive`。
- **命令管理**：`YoDialog` 定高三栏。列表项同样走 `.yohu-interactive`，禁止自写圆角底。
- 结果区为结构化卡片列表；设备维度分组。

### 4.3 文件管理

- 布局：工具栏 → 路径栏（面包屑）→ 四列清单 + 可收起预览 → 传输面板。
- 四列清单：`YoVirtualList` 选择模式（含 ripple）；前三列 `YoColResizer`。
- 面包屑覆盖 ripple 几何为 `radius-xs` + inset 0。
- 预览宽 `--yohu-layout-preview`；右键 `YoContextMenu`。

### 4.4 设置

- 页面是滚动容器；`YoPanel` 不裁切表单项。
- 控件（`YoTextField`/`YoSelect`）在设置页必须 `width: 100%`。
- 页宽 `--yohu-layout-settings-max`。

---

## 5. 组件可达性基准（对齐 Kobalte 交互模型，自研实现）

| 组件 | 键盘 | ARIA |
|------|------|------|
| YoDialog | Esc 关；焦点陷阱；打开后聚焦面板；关闭后还原焦点 | `role=dialog aria-modal` |
| YoTabs | ←/→ 切换；Home/End；Delete 关闭（可关时）；Ctrl+Tab 循环 | `role=tablist/tab/tabpanel` |
| YoSelect | 展开后 ↑/↓ 选项；Enter 选；Esc 关 | `role=combobox aria-expanded aria-activedescendant` |
| YoTree | ↑/↓ 移动；→ 展开/← 收起；Enter 选中 | `role=tree/treeitem aria-expanded` |
| YoVirtualList | 选择模式：roving tabindex + ↑/↓/Home/End/Enter/Space | 选择模式 `role=listbox/option` + `aria-selected` |
| YoContextMenu | Esc 关闭；点击项执行；点击外部关闭 | `role=menu/menuitem` |
| YoIconButton | 激活执行；`loading` 时不可激活 | `aria-label`（title）+ `aria-busy` |

---

## 6. 实施顺序（与代码质量门禁绑定）

| 阶段 | 内容 | 门禁 |
|------|------|------|
| **A. Token 升级** | 三层 token + 双主题语义板 + 密度/布局 + 级别板 + 动效 + 交互态 | token 单测 + 纪律 lint + 两主题对比度抽查 |
| **B. 组件打磨** | Yo 标注；`.yohu-interactive` 选中片；焦点环单源 | 组件测试全覆盖 |
| **C. 壳重绘** | 设备卡片/导航/状态栏/设置页按 §3/§4.4 | Vitest + 冒烟脚本 |
| **D. 三模块重绘** | 按 §4.1–4.3 逐模块重绘 | 模块单测 + 真机联调 |
| **E. 交互态收敛** | 全表面消费 ripple 原语；Y* 清零 | lint 圆角门禁 + 契约测试 |

每阶段独立提交；文档与实现同步更新。

---

**本文件为主规范；冲突时以本文件为准（并修订本文件）。**
