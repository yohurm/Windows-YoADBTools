# Yovo ADB Tools v6 — UI 设计系统规范（UI 打磨单一事实源）

> **状态：** v1.1（2026-08-17，融合 HarmonyOS 设计语言）  
> **调研依据：** HarmonyOS 开发者文档设计规范（详见 `docs/architecture/harmonyos-design-notes.md`：宇宙蓝/圆角阶梯/时长分级/标准缓动）、Evil Martians《Devs in mind 2025》、Fluent 2（密度/排版）、Mirafold（语义 token 体系）、Kobalte（无头可及性交互模型）、业界日志查看器实践。  
> **执行载体：** `@yovo/ui`（token 单源 + 组件）+ `@yovo/app`（壳）+ `@yovo/modules/*`（三模块）。所有改动必须同步更新本文件。
>
> **v1.1 变更（HarmonyOS 融合）**：主强调色 → 宇宙蓝 `#0A59F7`（浅）/`#4C8DFF`（深）；语义色对齐鸿蒙（浅色取深色变体以保正文对比度 ≥4.5:1，由 WCAG 门禁测试强制）；圆角阶梯 → 4/8/16/20/32；动效 → 鸿蒙时长分级 100/160/300/350ms + 标准曲线 `cubic-bezier(0.4,0,0.2,1)`/减速 `(0,0,0.4,1)`。PC 桌面端遵循鸿蒙「PC 小 2vp、8vp 网格」原则做密度收敛。

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

- `--yovo-density`：`compact`（默认）| `comfortable`，切换：控件高 26/32、行高 22/26、面板内边距 10/14。
- 日志行高：compact 22px（当前值保持），设备列表行高 34，导航项 32。

### 2.4 动效

- 时长分级（HarmonyOS）：`--yovo-dur-fast: 100ms`（hover/按下）、`--yovo-dur-normal: 160ms`（面板/下拉）、`--yovo-dur-slow: 300ms`（页面级）、`--yovo-dur-enter: 350ms`（入场/退场）；循环指示：`--yovo-dur-loop: 800ms`（spinner）、`--yovo-dur-loop-slow: 1.2s`（不确定进度条扫动）
- 缓动：`--yovo-ease-standard: cubic-bezier(0.4,0,0.2,1)`（标准）、`--yovo-ease-decel: cubic-bezier(0,0,0.4,1)`（减速）、`--yovo-ease-loop: ease-in-out`（循环）
- JS 消费侧经 `@yovo/ui` 导出 `MotionDuration` / `MotionEasing`（与 theme.css 契约测试强制一致）；动效时长硬编码由纪律 lint 拦截
- 用途克制：下拉展开/淡入淡出/行高亮过渡；日志列表**不动效**（性能优先）。

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

- **设备栏**：设备卡片（型号一行 + serial 等宽一行 + 在线点 + 未授权徽章）；空态给引导文案；选中 = accent-soft 底 + 2px accent 左边条。
- **导航**：图标 16px + 标题；激活项 accent 文字 + accent-soft 底；Planned 项「开发中」胶囊徽章。
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

### 4.2 ADB 命令终端

- 布局：工具栏 → 左侧命令库（树，可折叠分组） → 右侧结果区。
- 结果区改为 **结构化卡片列表**：每条 = 头部行（设备徽章 + 命令名 + 通过/失败徽章 + 用时）+ 折叠输出区（stdout 等宽滚动，默认展开失败项输出）。
- 设备维度分组：多设备执行时按设备分组展示（组头 = 设备 + 汇总徽章）。
- 命令库树：组节点加命令数徽章；命令节点 hover 显示完整模板（title 提示）。

### 4.3 文件管理

- 布局：工具栏（上传/新建目录/刷新）→ 路径栏（面包屑化：`sdcard ▸ DCIM ▸ Camera`，逐级可点 + 根 `/` + 上级按钮）→ 双栏（目录列表 | 文件列表）。
- 目录列表：仅目录（当前目录子目录，点击下钻；符号链接标注「链接」徽章）；文件列表：当前目录文件（名称/大小/修改时间，等宽右对齐；悬停行显操作按钮）。
- 文件图标：按扩展名分类色（媒体/文档/APK/归档/其他）。
- 传输面板：卡片式（方向图标 + 文件名 + 进度条 + 速度 + 取消）；完成 3s 后淡出（动画经动效 token，终态由 store 移除）。

### 4.4 设置

- 分组卡片（工具链 / 日志 / 外观）；每项 label + 输入 + 生效说明（「立即生效」「重启生效」徽章）；保存成功 toast；`adb.path` 旁「浏览」按钮。

---

## 5. 组件可达性基准（对齐 Kobalte 交互模型，自研实现）

| 组件 | 键盘 | ARIA |
|------|------|------|
| YDialog | Esc 关；焦点陷阱；打开后聚焦面板；关闭后还原焦点 | `role=dialog aria-modal` |
| YTabs | ←/→ 切换；Home/End；Delete 关闭（可关时）；Ctrl+Tab 循环 | `role=tablist/tab/tabpanel` |
| YSelect/YComboBox | 展开后 ↑/↓ 选项；Enter 选；Esc 关；可搜索时输入过滤 | `role=combobox aria-expanded aria-activedescendant` |
| YTree | ↑/↓ 移动；→ 展开/← 收起；Enter 选中 | `role=tree/treeitem aria-expanded` |
| YVirtualList | 选择模式：行可聚焦（roving tabindex）+ ↑/↓/Home/End/Enter/Space | 选择模式 `role=listbox/option` + `aria-selected`（单选）；非选择模式无列表语义（性能路径） |

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
