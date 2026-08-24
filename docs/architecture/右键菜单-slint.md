# 右键菜单架构（Slint 版）

> **状态：** 设计定稿（随 Slint UI 接入落地）  
> **范围：** 工作台内所有场景的上下文菜单（文件清单、日志 Tab、日志行；后续终端等只加场景表）  
> **ADR：** ADR-slint-019（主表见 `docs/architecture/架构设计-slint.md` §14）  

---

## 1. 决策结论

引擎在 UI 组件层（Slint 组件 + Rust 绑定，与 keymap 同级）。场景表按模块收口（每模块一份 Rust 场景表）。壳只挂唯一 `YoContextMenuHost`。模块禁止再自渲染菜单或自管坐标。

业务 store 不进 UI 组件层。模块之间仍然零依赖（ADR-slint-012）。

---

## 2. 菜单引擎

- **引擎**：`YoContextMenu` 组件 + Rust 绑定（场景注册/坐标计算/键盘导航/关闭策略）。
- **宿主**：壳唯一 `YoContextMenuHost`（Slint 浮层层，一次只开一个场景）。模块禁止再挂菜单宿主。
- **入口**：统一 `open(serial, scene, event)`：
  - 坐标来源 = 鼠标右击位置 / 键盘激活元素位置（Slint 事件坐标）；
  - 场景解析出动作表（见 §4）；
  - 按可用空间自动决定向下/向上展开，靠近右缘时左对齐。

**API（Rust 绑定，示意）**：

```rust
// 场景表注册（模块提供，壳收口）
pub struct MenuScene { pub id: &'static str, pub actions: &'static [MenuAction] }
pub struct MenuAction { pub id: &'static str, pub label: &'static str,
                        pub icon: Option<IconName>, pub kind: MenuActionKind,
                        pub enabled: bool, pub checked: Option<bool> }

// 宿主
pub fn open_menu(host: &YoContextMenuHost, scene: &MenuScene, origin: Point,
                 payload: Option<MenuPayload>);
pub fn close_menu(host: &YoContextMenuHost);
```

---

## 3. 宿主与定位

- `YoContextMenuHost` 是壳级唯一浮层（叠加在内容区之上），同一时刻只渲染一个场景。
- **高度自适应**：菜单内容 hug 内容高度；`min-width` = 触发元素宽，禁止锁死宽度。
- **滚动**：默认不滚动；仅内容高于可用空间时菜单内部才出现滚动区，横向永远隐藏。
- **定位**：默认向下展开；可用空间不足向上；靠近窗口右缘时对齐右缘。
- 菜单样式走组件集 token（`surface` + `radius-sm` + hairline + XS 阴影 + `YoInteractive` 项），禁止场景表内自写样式。

---

## 4. 场景表（按模块收口）

| 模块 | 场景 id | 动作 | 备注 |
|------|---------|------|------|
| 文件管理 | `files.list` | 新建文件 / 新建目录 / 下载 / 复制路径 / 删除 | 以点击行/当前目录为 payload |
| 日志分析 | `logs.tab` | 关闭其他 / 重命名 / 复制会话 | 右键会话 Tab |
| 日志分析 | `logs.row` | 复制选中行 | 未选中先选中该行；与 Ctrl+C 同一 `copyLogText` |
| 终端（后续） | `terminal.history` | … | 只加场景表 |

- 动作执行 = 调用命令层（`files.*` / `logs.*`），不做跨模块业务。
- 危险动作（删除）在场景表标记 `danger`；菜单项用错误色。

---

## 5. 键盘与可及性

| 键 | 行为 |
|----|------|
| 右键 | 打开菜单；`logs.row` 未选中先选中该行 |
| Esc | 关闭菜单，焦点还原到触发元素 |
| ↑/↓ | 移动高亮；`disabled` 项跳过 |
| Enter | 执行高亮项 |
| Home/End | 首/尾项 |
| 点击外部 | 关闭菜单 |

- 打开后焦点陷阱在菜单内；关闭后还原焦点。
- 菜单项 `disabled` 可见但不可激活；`checked` 项显示勾号。

---

## 6. 纪律

- **禁止**：模块自挂菜单宿主；场景内自写菜单样式；模块间场景交叉引用。
- 新增菜单场景只改对应模块的场景表文件 + 本表登记；引擎与宿主不动。
- 测试：场景表动作路由单测 + 键盘导航/关闭策略（cargo test + slint-testing）。
