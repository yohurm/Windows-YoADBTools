# Yovo ADB Tools v6 — UI 设计系统规范（UI 打磨单一事实源）

> **状态：** v1.2（2026-08-17，壳/三模块底向上布局）  
> **调研依据：** HarmonyOS 开发者文档设计规范（详见 `docs/architecture/harmonyos-design-notes.md`：宇宙蓝/圆角阶梯/时长分级/标准缓动）、Evil Martians《Devs in mind 2025》、Fluent 2（密度/排版）、Mirafold（语义 token 体系）、Kobalte（无头可及性交互模型）、业界日志查看器实践。  
> **执行载体：** `@yovo/ui`（token 单源 + 组件）+ `@yovo/app`（壳）+ `@yovo/modules/*`（三模块）。所有改动必须同步更新本文件。
>
> **v1.1 变更（HarmonyOS 融合）**：主强调色 → 宇宙蓝 `#0A59F7`（浅）/`#4C8DFF`（深）；语义色对齐鸿蒙（浅色取深色变体以保正文对比度 ≥4.5:1，由 WCAG 门禁测试强制）；圆角阶梯 → 4/8/16/20/32；动效 → 鸿蒙时长分级 100/160/300/350ms + 标准曲线 `cubic-bezier(0.4,0,0.2,1)`/减速 `(0,0,0.4,1)`。PC 桌面端遵循鸿蒙「PC 小 2vp、8vp 网格」原则做密度收敛。
>
> **v1.2 变更（底向上布局）**：设备数徽章紧跟「设备」标题；`YIconButton.loading` 走 `--yovo-dur-loop` 旋转；设置页两列网格 + 页面滚动（面板不裁切）；文件管理改为资源管理器四列 + 可收起预览 + `YContextMenu`/`YFileIcon`；命令管理三栏；日志采集从开始时刻清空缓冲并出流。

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
Semantic（语义别名：--yovo-fg / --yovo-surface / --yovo-accent / --yovo-success…，主题相关）
   ↓
Component（组件级：--yovo-button-hover-bg / --yovo-log-level-w…，唯一被组件消费）
```

- 组件与模块 CSS **只允许引用 Semantic/Component 层**；Primitive 仅在 tokens 内出现。
- 主题切换 = 切换 Semantic 层变量（`[data-theme=light|dark]`），零运行时成本。
- 纪律检查脚本（scripts/check-ui-tokens.mjs）继续强制：组件外零硬编码色值/字号。

### 2.1 色彩系统（语义板）

| 语义 | Light | Dark | 用途 |
|------|-------|------|------|
| `--yovo-bg-base` | `#F5F6F8` | `#17181C` | 窗口底色 |
| `--yovo-surface` | `#FFFFFF` | `#1F2127` | 面板/卡片 |
| `--yovo-surface-2` | `#F0F2F5` | `#262930` | 次级表面（列表头/输入底） |
| `--yovo-fg` | `#1B1D22` | `#E8EAEF` | 主文本 |
| `--yovo-fg-2` | `#565D68` | `#A6ADBB` | 次要文本 |
| `--yovo-fg-3` | `#8A919C` | `#6E7686` | 弱化文本/占位 |
| `--yovo-border` | `#D9DEE6` | `#333844` | 常规边框 |
| `--yovo-border-strong` | `#B7BFCB` | `#454B58` | 强调边框/分割 |
| `--yovo-accent` | `#1456A8` | `#6EA8E8` | 主强调/选中 |
| `--yovo-accent-soft` | `#DCE9FA` | `#22334D` | 选中底/高亮底 |
| `--yovo-success` | `#1F7A33` | `#57B96B` | 在线/通过 |
| `--yovo-warn` | `#9A6A00` | `#D9A43C` | 警告/执行中 |
| `--yovo-error` | `#C22929` | `#E86A6A` | 失败/崩溃 |
| `--yovo-offline` | `#8A919C` | `#6E7686` | 离线/禁用 |
| `--yovo-focus-ring` | `rgba(20,86,168,.45)` | `rgba(110,168,232,.5)` | 键盘焦点环（2px） |

**logcat 级别专用板（Component 层，双主题各一组）：**

| 级别 | Light | Dark | 语义 |
|------|-------|------|------|
| `--yovo-level-v` | `#8A919C` | `#6E7686` | Verbose（弱） |
| `--yovo-level-d` | `#3D6E9E` | `#7FA8CE` | Debug（蓝） |
| `--yovo-level-i` | `#1F7A33` | `#57B96B` | Info（绿） |
| `--yovo-level-w` | `#9A6A00` | `#D9A43C` | Warn（琥珀） |
| `--yovo-level-e` | `#C22929` | `#E86A6A` | Error（红） |
| `--yovo-level-f` | `#FFFFFF on #C22929` | `#1B1D22 on #E86A6A` | Fatal（反色块） |

### 2.2 排版

- 界面字体：`"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif`
- 数据/等宽：`"Cascadia Mono", Consolas, "Courier New", monospace`（`font-variant-numeric: tabular-nums`）
- 字号阶梯（compact 默认）：Caption 11 / Body 12.5 / BodyStrong 13.5 / Subtitle 15 / Title 18；comfortable 各 +1px（密度变量驱动）
- 行高：数据行 1.4；正文 1.55

### 2.3 密度模式

- `--yovo-control-height`：compact 26px / comfortable 32px。按钮、输入框、图标按钮、路径栏、过滤栏控件统一走该变量，禁止各写一套高度。
- 日志行高：compact 22px（当前值保持），设备列表行高 34，导航项 32。

### 2.4 动效

- 时长分级（HarmonyOS）：`--yovo-dur-fast: 100ms`（hover/按下）、`--yovo-dur-normal: 160ms`（面板/下拉）、`--yovo-dur-slow: 300ms`（页面级）、`--yovo-dur-enter: 350ms`（入场/退场）；循环指示：`--yovo-dur-loop: 800ms`（spinner）、`--yovo-dur-loop-slow: 1.2s`（不确定进度条扫动）
- 缓动：`--yovo-ease-standard: cubic-bezier(0.4,0,0.2,1)`（标准）、`--yovo-ease-decel: cubic-bezier(0,0,0.4,1)`（减速）、`--yovo-ease-loop: ease-in-out`（循环）
- JS 消费侧经 `@yovo/ui` 导出 `MotionDuration` / `MotionEasing`（与 theme.css 契约测试强制一致）；动效时长硬编码由纪律 lint 拦截
- 用途克制：下拉展开/淡入淡出/行高亮过渡；日志列表**不动效**（性能优先）。
- **加载循环**：`YIconButton loading` 给图标加 `yovo-icon-button--loading`，按 `--yovo-dur-loop` 线性旋转；加载期间按钮 `disabled` + `aria-busy`。设备栏刷新、文件刷新等长操作必须走该入口，禁止模块自写 spinner。

### 2.5 图标

- **唯一入口**：`@yovo/ui` 的 `<Icon name size>`；模块注册表 `icon: IconName`；工具栏用 `YIconButton`（内部仍走 `Icon`）。
- **文件类型图标**：`<YFileIcon name kind size>`（`file-icons.tsx` 工厂，Material Icon Theme 风格色块字形）。模块禁止内联文件 SVG；色值仅允许出现在该文件（纪律脚本豁免）。
- **禁止**：模块内再写一份 SVG、emoji 当图标、静态对象缓存 JSX 节点（Solid 会把节点从导航挪到内容区）。
- **风格**：24×24 viewBox、描边 2、`currentColor`；`play`/`pause` 实心。新增通用图标只改 `icons.tsx` 的 `ICON_GLYPHS`。

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

- **设备栏**：标题行 = 折叠钮 +「设备」+ 数量徽章（徽章紧跟标题，不推到最右）+ 刷新（`YIconButton loading` 旋转）；设备卡片（型号一行 + serial 等宽一行 + 在线点 + 未授权徽章）；空态给引导文案；选中 = accent-soft 底 + 2px accent 左边条。
- **导航**：图标 16px（`<Icon>` 单源，currentColor）+ 标题；激活项 accent 文字 + accent-soft 底；Planned 项「开发中」胶囊徽章。图标节点每次渲染新建（禁止静态缓存 JSX，避免 Solid 把导航图标挪到模块里）。
- **状态栏**：左版本/中留白/右「设备 · 任务 · 状态」；任务悬停显示明细。
- **快捷键统一表（v6.1 目标）**：`Ctrl+K` 命令面板（模块跳转/刷新设备/开始采集…）；模块内快捷键不变。

---

## 4. 模块 UI 规范

### 4.1 日志分析（核心打磨对象）

- 布局：工具栏 → 会话 Tab 栏 → 过滤栏（单行） → 虚拟列表 → 会话状态行。
- 行结构（列对齐，等宽）：`[时间 18ch] [PID 6→] [级别 1] [Tag ≤24ch] [消息 →]`；级别用色字 + 细左条（3px，按级别色）；Fatal 反色块；行选中态（roving tabindex + ↑/↓/Home/End/Enter/Space，listbox 语义）。
- 行交互：hover 整行 accent-soft 4% 稀释底（无过渡，日志列表不动效）；点击选中；信号行（崩溃/ANR）行底色 `--yovo-signal-bg` + 左侧 Error 条。
- 过滤栏：级别含以上 / Tag / 关键字检索（放大镜图标 + 「清除」；过滤生效时检索框 accent 边框）+ 会话 scope 徽章；控件统一 26px 高。
- 会话 Tab：标题 + 采集绿点/信号红点 + 关闭 × + 新建 +；Tab 溢出可横向滚动；右键菜单（关闭其他/重命名/复制会话）。
- 状态行：`采集指示（绿点/灰点）· 设备 · 缓冲 n · 可见 n · 信号 n · 进程索引 n s 前 · 滞后回补提示`。
- 空态：未采集 → 插画图标 + 「点击开始采集」主按钮；采集中空 → 等待输出；过滤无命中 → 「无匹配日志，调整过滤条件」。
- **采集可见性**：点「开始」先清空 UI 镜像与可见区，core 同步 `ring.clear()`，只展示启动之后的 logcat；失败 toast 出错误。
- **导出**：设置项 `export.default_path` / `export.ask_every_time` / `export.write_mode`（覆盖|续写）。每次询问开 → 保存对话框；关 → 默认目录 `logcat-{serial}.txt`。

### 4.2 ADB 命令终端

- 布局：工具栏（标题 + 执行 + 命令管理）→ 左侧命令库（树，可折叠分组） → 右侧结果区。设备焦点以左侧设备栏为准，工具栏不重复「在线设备」与刷新。
- 命令库树：组节点加命令数徽章；点击组行或展开箭头即选中该组（可直接「执行」组）；命令节点 hover 显示完整模板（title 提示）。
- **命令管理**：`YDialog` 定高三栏（组列表 | 命令列表 | 单一编辑器）。点组只编辑组属性；点命令只编辑该命令（标题带所属组名）。打开时深拷贝快照，打开期间不因 store 变化重置草稿。
- 结果区改为 **结构化卡片列表**：每条 = 头部行（设备徽章 + 命令名 + 通过/失败徽章 + 用时）+ 折叠输出区（stdout 等宽滚动，默认展开失败项输出）。
- 设备维度分组：多设备执行时按设备分组展示（组头 = 设备 + 汇总徽章）。

### 4.3 文件管理

- 布局：工具栏（上传 / 刷新 / 预览开关）→ 路径栏（面包屑：`/ ▸ sdcard ▸ DCIM`，逐级可点 + 上级按钮）→ 资源管理器主区（四列清单 + 可收起预览）→ 传输面板。
- **四列清单**：名称（默认约 168px，不过分抢宽）/ 类型 / 大小 / 修改时间（末列吃剩余）；表头 `YColResizer` 可拖拽列宽。目录与文件同一列表，目录优先；双击目录下钻。无独立「目录栏」。
- **预览窗**：右侧，默认收起（`flex-basis: 0`）；打开后约 240px，展示图标 + 名称 + 元数据。类 Windows 资源管理器预览。
- **右键菜单**（`YContextMenu`，按模块给清单）：文件管理当前为 新建文件 / 新建目录 / 删除。删除走二次确认对话框；支持 Ctrl/Shift 多选。行内无删除图标；路径栏无「新建目录」。
- 传输面板：卡片式（方向图标 + 文件名 + 进度条 + 速度 + 取消）；完成 3s 后淡出（动画经动效 token，终态由 store 移除）。

### 4.4 设置

- **页面是滚动容器**（`height: 100%; overflow: auto`）；`YPanel` 内容尺寸、`overflow: visible`、`flex-shrink: 0`，禁止用面板裁切表单项。
- 壳层 `html/body/#root` 与模块根 `overflow: hidden`：整窗不出滚动条；仅列表、设置页、结果区内部滚动。
- **项布局**：两列网格 `标签+生效徽章 | 全宽控件`，hint 落在控件列下方。控件（`YTextField`/`YSelect`）在设置页必须 `width: 100%`。
- 分组卡片（工具链 / 日志分析 / 外观）；保存成功 toast；路径项旁浏览按钮（ADB 文件 / 导出目录）。
- 日志导出：默认路径、每次询问开关、覆盖/续写。

---

## 5. 组件可达性基准（对齐 Kobalte 交互模型，自研实现）

| 组件 | 键盘 | ARIA |
|------|------|------|
| YDialog | Esc 关；焦点陷阱；打开后聚焦面板；关闭后还原焦点 | `role=dialog aria-modal` |
| YTabs | ←/→ 切换；Home/End；Delete 关闭（可关时）；Ctrl+Tab 循环 | `role=tablist/tab/tabpanel` |
| YSelect/YComboBox | 展开后 ↑/↓ 选项；Enter 选；Esc 关；可搜索时输入过滤 | `role=combobox aria-expanded aria-activedescendant` |
| YTree | ↑/↓ 移动；→ 展开/← 收起；Enter 选中；展开箭头同时选中该节点 | `role=tree/treeitem aria-expanded` |
| YVirtualList | 选择模式：行可聚焦（roving tabindex）+ ↑/↓/Home/End/Enter/Space；`selectedKeys` 为多选 | 选择模式 `role=listbox/option` + `aria-selected` + 多选时 `aria-multiselectable`；非选择模式无列表语义（性能路径） |
| YContextMenu | Esc 关闭；点击项执行；点击外部关闭 | `role=menu/menuitem` |
| YIconButton | 激活执行；`loading` 时不可激活 | `aria-label`（title）+ `aria-busy` |

---

## 6. 实施顺序（与代码质量门禁绑定）

| 阶段 | 内容 | 门禁 |
|------|------|------|
| **A. Token 升级** | 三层 token + 双主题语义板 + 密度变量 + 级别板 + 动效 | token 单测 + 纪律 lint + 两主题对比度抽查 |
| **B. 组件打磨** | 上述组件键盘/ARIA 补全；YButton 焦点环；YVirtualList 行选中态 | 组件测试全覆盖（键盘交互用 testing-library 模拟） |
| **C. 壳重绘** | 设备卡片/导航/状态栏/设置页按 §3/§4.4 | Vitest + 冒烟脚本 |
| **D. 三模块重绘** | 按 §4.1–4.3 逐模块重绘 | 模块单测 + 真机联调（UIA E2E + 人工清单） |

每阶段独立提交；文档与实现同步更新。

---

**本文件为主规范；冲突时以本文件为准（并修订本文件）。**
