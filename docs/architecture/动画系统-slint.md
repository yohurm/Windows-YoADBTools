# 动画系统（Slint 版）

> **状态：** 设计定稿（随 Slint UI 接入落地）  
> **范围：** 自研 Slint 组件集动效单源（时长/曲线 token）+ 原语 + 配方；壳（侧栏）与模块只消费配方，禁止自写时长/曲线/动画属性。  
> **对照：** HarmonyOS 设计指南·动效（`docs/architecture/harmonyos-design-notes.md` §5）；外部研究缓存 `temp/motion-research/`。  
> **ADR：** ADR-slint-017（主表见 `docs/architecture/架构设计-slint.md` §14）。数值沿用鸿蒙时长分级（100/160/300/350ms）与标准/减速曲线。  

---

## 1. 动效单源（L1：Token）

**载体：Slint 全局常量 + 导出 struct `MotionSpec`（组件只 import，不重定义）。**

| 层级 | 内容 | Slint 承载 |
|------|------|------------|
| 时长 | 鸿蒙分级 100 / 160 / 300 / 350ms；另设 40ms（hover/ripple 瞬时）、400ms（拖拽跟手） | `const DUR_XXX: duration` |
| 曲线 | 标准（`cubic-bezier(0.4, 0, 0.2, 1)`）、减速（`cubic-bezier(0, 0, 0.2, 1)`）、加速（`cubic-bezier(0.4, 0, 1, 1)`）、反弹 | Slint `easing`（`cubic-bezier` 字面量） |
| 语义槽 | Material：Standard（`ease-out`）、Emphasized（`ease-in-out`）、Emerging（`cubic-bezier(0.4,0,0.2,1)`）；Fluent：FastEase / SlowEase | `EASE_*` 常量 |
| 命名 | 语义名 `--yohu-dur-*` / `--yohu-ease-*`（历史名）→ Slint 常量名 `DUR_*` / `EASE_*` | 全局 `import { DUR_*, EASE_* }` |

**规则：** 组件属性动画一律引用 `DUR_*` / `EASE_*`；仓库纪律脚本扫描 `.slint` 禁止裸 `duration:` / `easing:` 字面量（列表外值须注释用途）。

### 1.1 时长表（鸿蒙对齐）

| 时长 | 用途示例 | Slint |
|------|----------|-------|
| 40ms | hover 边框/背景、ripple | `DUR_40MS` |
| 100ms | 细微反馈（开关 thumb、checkbox）、滚动条淡入 | `DUR_100MS` |
| 160ms | 快速切换（tab 滑块、segmented） | `DUR_160MS` |
| 300ms | 常规（面板展开、菜单、toast） | `DUR_300MS` |
| 350ms | 强调（drawer、dialog、大块出入场） | `DUR_350MS` |
| 400ms | 拖拽跟手（缓动被手势覆盖） | `DUR_400MS` |

### 1.2 曲线表（Material 语义槽）

| 曲线 | 值（cubic-bezier） | 用途 |
|------|--------------------|------|
| Standard | `(0.4, 0, 0.2, 1)` | 通用入场（property 变化） |
| Emphasized | `(0.4, 0, 0.2, 1)` 双段 | 大元素/页面级 |
| Emerging | `(0.4, 0, 0.2, 1)` | 弹层自下而上 |
| Decelerate | `(0, 0, 0.2, 1)` | 大块入场（背景+内容错峰） |
| Accelerate | `(0.4, 0, 1, 1)` | 离场 |
| Standard 反向 | `(0.2, 0, 0.4, 1)` | 离场快捷 |

> 实现说明：Slint `easing` 支持 `cubic-bezier(x1, y1, x2, y2)` 字面量，可直接表达上述曲线；`ease-out`/`ease-in-out` 关键字作简写。**禁止**在组件内直接写曲线字面量，一律引用常量。

---

## 2. 原语（L2：Slint 组件原语）

> 原语以 Slint 组件 + 属性动画实现，供配方与业务组件复用。

| 原语 | CSS 时代语义 | Slint 落地 |
|------|--------------|------------|
| **YoPresence** | 挂载/卸载前先播 200ms 动画（卸载后移除 DOM） | Slint 组件 `presence-in`/`presence-out` 状态：`animate opacity`/`y`；离场完成由 Rust 回调通知后再从属性树移除元素 |
| **YoCollapse** | 折叠/展开内容高度过渡 | Slint `animate height` + `clip: true`；`height` 由内容测量绑定 |
| **YoIndicator** | 选中滑块（tab/segmented）沿轴滑动 | Slint `animate x`/`animate width`（滑块绝对定位在轨道内） |
| **YoSwap** | 沿轴裁切换牌 | Slint `animate width`/`x` + `clip`（两内容叠放，宽窄切换） |
| **YoFade** | 淡入淡出（滚动条、悬停提示） | Slint `animate opacity` |

**实现要点：**

- 进出场不对称（入场减速、离场加速）：Slint `states` 的 `in` / `out` 各声明 `animate` 块，`out` 更快（如 `in 300ms` / `out 160ms`）。
- 可打断：Slint 属性动画天然可打断（新目标值到达即重定向），无需额外处理。
- 禁用动效（系统减弱动效 / 用户设置）：组件条件性跳过动画，直接置终态（见 §6）。

---

## 3. 配方（L3：可复用动效配方）

> 配方 = 原语组合 + 鸿蒙数值，供壳与模块直接套用。命名沿历史语义名（`--yohu-*`），实现为 Slint 组件/属性动画。

### 3.1 Dialog

| 时刻 | 配方 | Slint |
|------|------|-------|
| 入场 | 整体 160ms 减速+淡入；内容 300ms 上升 | `animate opacity: 160ms` + 内容 `animate y: 16→0, 300ms`（错峰） |
| 离场 | 160ms 加速 | `out: opacity 160ms accelerate` |
| 遮罩 | 100ms 淡入 | `animate opacity 100ms` |
| 焦点 | 进入 200ms，内部切换 160ms | `animate` 块 |

### 3.2 Toast

| 时刻 | 配方 |
|------|------|
| 入场 | 150ms 减速 + 16px 上移 → 0（`animate opacity` + `animate y`） |
| 停留 | 时长 = 1s + 120ms·min(字数,30) |
| 离场 | 200ms 淡出 + 4px 下移（`out` 加速） |

### 3.3 Drawer / Menu

| 项 | 配方 |
|----|------|
| Drawer | 320ms 错峰：遮罩 100ms 淡入 → 抽屉自左滑入 350ms 减速；离场 200ms 加速 |
| Menu | 150ms 减速 + 2px 上移淡入；按出触发的位置错开（NearTop 向下 / NearBottom 向上） |

### 3.4 Rail / 侧栏

| 项 | 配方 |
|----|------|
| 折叠 | 350ms：宽度动画（`animate width` 固定尺寸档位，不做任意拖拽宽度） |
| 展开 | 160ms 快速（用户主动）；悬停 100ms（无点击拖拽） |
| 选中 | 滑块 160ms（`YoIndicator`） |

> 历史 Web 实现依赖网格插值（`grid-template-columns`）实现 rail 宽度过渡；Slint 布局不支持网格尺寸插值，改用**固定宽度档位 + `animate width`**（折叠档/展开档），配合 `clip`。

### 3.5 Panel（设置面板 / 文件页分组）

| 项 | 配方 |
|----|------|
| 展开/折叠 | `YoCollapse`：300ms Standard |
| 内容过渡 | 100ms（内部切换） |

### 3.6 Switch / Checkbox / Progress

| 项 | 配方 |
|----|------|
| Switch | thumb 100ms（状态切换）；轨道色 100ms 过渡 |
| Checkbox | 勾号 100ms 淡入（`animate opacity`） |
| Progress | 不确定指示器循环：`animation-tick` 驱动滑块平移（线性，1s 往返） |

---

## 4. 组合（L4：多元素串联）

- **入场错峰**：Dialog 内容 300ms 上升 + 遮罩 100ms + 背景 350ms（Emerging）→ 用 Slint 多元素各自 `animate` 块 + 延时（Slint 不支持 `animation-delay`，用内部属性触发时机差 / 嵌套组件 state 控制）。
- **拖拽跟手**：`DUR_400MS`，缓动可被手势覆盖；传输卡片速度采样节流 200ms。

---

## 5. 动作设计（L5）与纪律

- 动作语义（hover/pressed/disabled）沿用 Material 状态层：`ease-out` 40ms（hover）/ 100ms（pressed），Slint 属性绑定到 `TouchArea` 状态。
- **纪律：** 组件禁止自写动效数值；配方表为唯一来源。代码评审 + 纪律脚本双保险。

---

## 6. 减弱动效（Reduce Motion）

| 开关 | 行为 |
|------|------|
| 系统「减弱动态效果」开启 | 全部配方降级为 40ms 或瞬态；滑块/循环动画停止 |
| 应用内 `density`/主题不控制动效 | 动效开关跟随系统（Slint 平台 `reduced-motion` 查询 + 全局条件） |

---

## 7. 测试与验收

| 项 | 方式 |
|----|------|
| 数值纪律 | 纪律脚本扫描 `.slint`：禁裸 duration/easing 字面量（白名单外） |
| 组件行为 | cargo test + slint-testing：状态切换/进出场完成回调/减弱动效分支 |
| 性能 | 交互不掉帧（S4 性能验收）；循环动画仅指示器等少量元素 |
| 手测 | 真机验收：Dialog/Toast/Drawer 出入场、Rail 折叠、Tab 滑块、传输卡片淡出 |
