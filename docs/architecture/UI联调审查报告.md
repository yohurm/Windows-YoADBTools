# Yovo ADB Tools — UI 联调审查报告

| 项 | 内容 |
|---|---|
| 审查日期 | 2026-08-11 |
| 审查对象 | 运行中的 `FactoryHelper`（标题：Yovo ADB Tools） |
| 窗口规格 | 默认 1200×740；压力场景 MinSize 980×560 |
| 审查方式 | 真实窗口截图（PrintWindow）+ UI Automation 边界测量 + XAML/ViewModel 对照 |
| 截图目录 | `.ui-review/`（本地联调产物，不入库亦可） |
| 结论摘要 | 信息架构与 Token 体系整体清晰；存在若干 **DockPanel 末子填充误用**、**表头/选中态对比度**、**执行按钮 CanExecute 交叉启用** 等可复现缺陷，建议按 P0→P2 修复 |

---

## 1. 审查范围

| 面板 / 窗口 | 覆盖点 |
|---|---|
| Shell 主窗口 | 标题栏、设备区、模块导航、状态栏 |
| ADB 命令终端 | 工具栏、单条命令/命令组列表、执行日志、参数输入列动态展开 |
| 设置 | ADB 路径 / 数据目录卡片、浏览与保存 |
| 预留模块 | 投屏显示等占位页 |
| 命令库管理 | 单条命令 / 命令组 Tab、步骤 DataGrid、保存与关闭确认 |

功能细节同步审查：`CanExecute`、设备选择、双列表独立选中、输入面板开关、命令组编辑绑定、脏关闭确认等。

---

## 2. 总体评价

**做得好的部分**

- 右侧统一操作面板（导航 → 内容）信息架构清楚，预留模块占位可读。
- ThemeTokens 集中管理颜色/字号/间距/尺寸，视图硬编码较少。
- 参数输入列：选中需输入命令后列宽由 code-behind 展开（实测 `参数输入` 面板出现，宽约 280 逻辑像素）。
- 命令库管理：深拷贝快照 + 保存全量提交；选中命令组后基本信息与步骤列表可正确回填。
- 关闭未保存确认（ContentDialog）与编辑框 LostFocus 强制提交有实现。

**主要风险**

- 多处 `DockPanel` 默认 `LastChildFill=True`，导致「本应靠右」的控件跑到左侧或错位。
- 终端内「单条命令」与「命令组」可同时选中，且两个执行按钮共用同一 `CanExecute`，易误触执行旧命令。
- 列表选中态使用系统默认深蓝底，副标题/命令文本对比度极差。
- 窄高度下列表底项视觉裁切明显。

---

## 3. 缺陷清单（按优先级）

### P0 — 应尽快修

#### P0-1 命令组 DataGrid 表头文字被裁切

- **现象**：`延时(ms)` / `超时(ms)` 显示为「延时(m…」「超时(m…」。
- **实测**：Header 物理宽度约 93px（对应 XAML `Width="62"`）。
- **位置**：`CommandManagerWindow.xaml` DataGrid 列定义。
- **建议**：列宽 ≥ 78～86，或 `Width="Auto"` + `MinWidth`；表头允许换行/`TextTrimming` 策略二选一，优先完整显示。

#### P0-2 「保存」按钮落在窗口左下角

- **现象**：命令库管理底部「保存」贴左侧（实测 `leftGap≈21`，`rightGap≈1464`），而非右下角。
- **根因**：

```xml
<DockPanel>
  <TextBlock DockPanel.Dock="Left" .../>
  <ui:Button DockPanel.Dock="Right" Content="保存" .../> <!-- 末子，LastChildFill 忽略 Dock -->
</DockPanel>
```

- **建议**：`LastChildFill="False"`，或先 Dock 右侧按钮、再放左侧消息文本为末子填充。

#### P0-3 状态栏设备状态未靠右

- **现象**：`Yovo ADB Tools v1.0` 与 `设备: 已连接…` 全部挤在左侧（`设备:` 的 `rightGap` 约 1500+）。
- **根因**：`MainWindow.xaml` 底部 `DockPanel` 同样末子填充问题（右侧 `StackPanel` 为最后一个子节点）。
- **建议**：同 P0-2，保证设备状态靠右对齐。

#### P0-4 执行按钮 CanExecute 交叉启用 + 双列表残留选中

- **现象（实测）**：
  - 仅选中设备：两执行按钮均禁用（正确）。
  - 选中设备 + 单条命令后：`执行命令` **与** `执行命令组` **同时启用**。
  - 再选中命令组后：两按钮仍同时启用；且单条命令列表仍保持旧选中（截图 14）。
- **根因**：

```csharp
public bool CanExecute => !IsBusy && _devices.HasSelectedDevices
    && (SelectedCommand != null || SelectedGroup != null);
// ExecuteCommand / ExecuteGroup 共用上述 CanExecute
```

  两个 `ListBox` 选中互不影响，旧选中残留。
- **风险**：用户以为在跑命令组，点「执行命令」会跑残留的旧单条命令。
- **建议**：
  1. 拆成 `CanExecuteCommand` / `CanExecuteGroup`。
  2. 选中一侧时清空另一侧选中（或明确「当前执行目标」单一来源）。
  3. 工具栏高亮/文案与当前目标一致。

#### P0-5 列表选中态对比度不足（可读性）

- **现象**：单条命令 / 命令组 `ListBox` 选中为深蓝底；命令名、灰色 `DisplayCommand`、分类标签几乎不可读（截图 10/14）。
- **根因**：未提供基于 Token 的 `ItemContainerStyle`（设备/导航有自定义，命令列表没有）。
- **建议**：选中态使用 `Brush.AccentBg` + `Brush.Accent` 文字（与导航一致），副标题在选中时改为高对比色。

---

### P1 — 明显体验问题

#### P1-1 设备区折叠按钮位置错误

- **实测**：标题「设备」x≈118；折叠钮 x≈177；「刷新」x≈360。折叠钮贴在标题旁，而非刷新左侧。
- **根因**：`ToggleButton` 为 `DockPanel` 末子 → `LastChildFill`。
- **字形**：`Content="▾"`（U+25BE），Automation Name 正常；建议改用 Segoe MDL2 / 明确 Chevron，避免字体回退。
- **建议**：子节点顺序改为「刷新(Right) → 折叠(Right) → 标题(填充)」或 `LastChildFill="False"`。

#### P1-2 最小高度下列表底项被裁切

- **现象**：980×560 时，「单条命令」「命令组」列表最后可见项被底边/分隔条裁成半行（截图 07）。
- **建议**：列表 `ScrollViewer` 保证底 padding；或调整上下面板默认比例；分隔条避免视觉压字。

#### P1-3 设置页路径输入过窄

- **现象**：`C:\Users\...\AppData\...` 只显示前缀，需靠 Tooltip/光标才能看全。
- **根因**：`Size.FormInputCol = 280` 对 Windows 路径偏短。
- **建议**：路径行改为整行输入（标签上、控件下），或增大输入列并允许横向滚动显示光标处文本。

#### P1-4 设备列表无高度上限

- **现象**：设备 `ListBox` 无 `MaxHeight`；多设备时会挤压下方「模块」导航。
- **建议**：`MaxHeight`（如 160～220）+ 内部滚动；折叠按钮修好后作为辅助。

#### P1-5 启动不自动选中设备

- **现象**：扫描到 1 台设备后，执行按钮仍禁用，需用户再点选。
- **建议**：产线场景下，刷新后若仅 1 台在线可自动选中；多台则保持不选或保留上次 Serial。

#### P1-6 命令库管理选中态与 Shell 导航不一致

- **现象**：管理窗列表选中为系统深蓝+白字；Shell 导航为浅底强调色。
- **建议**：统一 `ListBoxItem` / DataGrid 行选中样式到 ThemeTokens。

#### P1-7 步骤详情区与表格不同步的感知

- **现象**：选中命令组后步骤表有数据，但下方「延时/超时」等在未点选步骤时为空，易误以为未加载。
- **建议**：选中组时默认 `SelectedStep = Steps.FirstOrDefault()`；或空态显示「请选择步骤」。

---

### P2 — 改进项

| ID | 问题 | 建议 |
|---|---|---|
| P2-1 | 执行日志 `ItemsControl` + 默认面板无限宽测量，长日志换行不可靠 | `HorizontalScrollBarVisibility=Disabled`，行宽绑定 `ScrollViewer.ViewportWidth` |
| P2-2 | 命令/组列表项 `Name` 无 `TextTrimming` | 加省略号 + ToolTip 全文 |
| P2-3 | `CommandDefinition`/`CommandGroup` 未重写 `ToString`，UIA 名为完整类型名 | `ToString => Name`，改善辅助功能 |
| P2-4 | 禁用态「执行*」对比度偏低 | 检查 Wpf.Ui Disabled 前景，必要时本地样式覆盖 |
| P2-5 | `SelectedItemsBehavior` 仅 UI→VM | 刷新后若需程序化回填选中，需补 VM→ListBox 同步 |
| P2-6 | 删除命令未取消 `PropertyChanged` 订阅 | 小泄漏，成对 Unsubscribe |
| P2-7 | 工具栏四按钮在极限窄宽下可能拥挤 | 考虑溢出菜单或换行（当前 MinWidth=980 尚可） |
| P2-8 | 输入面板展开后日志区变窄，无记忆列宽 | 可选：展开时记住用户拖拽宽度（已有 Splitter） |

---

## 4. 功能实现审查

### 4.1 已验证通过

| 功能 | 结果 | 证据 |
|---|---|---|
| 启动扫描设备 | 通过 | 状态「已连接 1 台设备」，列表显示 V2361A |
| 模块导航切换 | 通过 | 设置 / 投屏占位 / 终端互切正常 |
| 命令库加载日志 | 通过 | `命令库加载完成: 33 条命令, 3 个命令组` |
| 分类筛选 | 通过 | ComboBox 可选 Nori 产测等 |
| `[输入]` 标记与参数列展开 | 通过 | 选中「写号[PCBID]」后右侧出现「请输入 PCBID」 |
| 命令管理打开（模态、防重） | 通过 | `ShowDialog` + 单实例 Activate |
| 命令组编辑回填 | 通过 | 选中「设备信息采集」后名称/分类/描述/步骤表有数据 |
| 设置浏览/保存文案语义 | 代码审查通过 | ADB 立即生效、数据目录重启生效与需求一致 |
| 日志按 Source 过滤、内存上限 | 代码审查通过 | 与「不落盘」架构一致 |

### 4.2 功能缺陷 / 行为偏差

| 功能 | 问题 | 严重度 |
|---|---|---|
| 执行命令 / 执行命令组 | 共用 `CanExecute`；双列表可同时选中 → 误执行 | P0 |
| 设备选择 | 不自动选中；无选中则无法执行（易被理解为「坏了」） | P1 |
| 折叠设备列表 | 控件存在但布局错位，产线可用性下降 | P1 |
| 执行空输入拦截 | 代码有 `ValidateInputs`；依赖输入面板可见（已展开） | 通过（需保持） |
| 命令组步骤默认值 | JSON 未写的 `delayAfterMs` 显示模型默认 500，与「未配置」语义可能混淆 | P2（产品确认） |

### 4.3 与架构约定对照

| 约定（CLAUDE / v4） | 现状 |
|---|---|
| 右侧统一操作面板 | 符合 |
| ThemeTokens 统一 | 基本符合；列表选中态未完全纳入 |
| 编辑即快照 | 符合 |
| 服务层不暴露 UI 类型 | 符合（SelectedItemsBehavior 为壳层桥接） |
| 日志仅内存 + 界面 | 符合（`LogService` 无落盘） |
| 标签 = Category 派生 | 符合（`CommandLibrary.Categories`） |

---

## 5. 布局根因专题：DockPanel LastChildFill

多处缺陷同源。WPF `DockPanel` 默认 **最后一个子元素填充剩余空间，并忽略其 `Dock` 属性**。

| 位置 | 末子控件 | 期望 | 实际 |
|---|---|---|---|
| 设备标题行 | 折叠 `ToggleButton` | 靠右、贴刷新左侧 | 落在标题旁填充区 |
| 主窗状态栏 | 设备状态 `StackPanel` | 靠右 | 紧跟版本号左侧 |
| 命令库管理底栏 | 「保存」按钮 | 靠右 | 窗口左下角 |

**推荐写法（二选一）**：

```xml
<!-- A：关闭末子填充 -->
<DockPanel LastChildFill="False">
  <TextBlock DockPanel.Dock="Left" .../>
  <Button DockPanel.Dock="Right" .../>
</DockPanel>

<!-- B：填充元放最后 -->
<DockPanel>
  <Button DockPanel.Dock="Right" .../>
  <TextBlock .../> <!-- 末子填充 -->
</DockPanel>
```

---

## 6. 修复建议顺序

1. **DockPanel 三处**（保存 / 状态栏 / 设备折叠）— 改动小、收益大。  
2. **DataGrid 列宽** — 消除表头截断。  
3. **拆分 CanExecute + 互斥选中** — 消除误执行风险。  
4. **命令/组 ListBoxItem 选中样式** — 解决对比度。  
5. **设备 MaxHeight + 单设备自动选中** — 产线体验。  
6. **设置路径布局、日志换行、ToString/UIA** — 打磨项。

---

## 7. 截图索引

| 文件 | 内容 |
|---|---|
| `01-main-current.png` | 终端默认态 |
| `02-settings.png` | 设置页（路径截断） |
| `03-planned.png` | 投屏占位 |
| `04-cmdmgr-commands.png` | 命令管理-单条命令 |
| `05-cmdmgr-groups.png` | 命令管理-命令组（空选） |
| `07-main-min-size.png` | 最小尺寸裁切 |
| `09/13-cmdmgr-group-*.png` | 命令组选中回填；表头截断；保存偏左 |
| `10-device-cmd-selected.png` | 设备+命令选中；选中态对比度差 |
| `12-group-selected.png` | 命令组选中后双执行按钮同亮 |
| `14-input-panel.png` | 参数输入列展开；双列表同时选中 |

---

## 8. 验收检查清单（修复后回归）

- [ ] 命令库管理「保存」在窗口右下角  
- [ ] 状态栏「设备: …」在窗口右侧  
- [ ] 设备标题行：`设备` … `▾` `刷新`（折叠在刷新左侧）  
- [ ] DataGrid 表头「延时(ms)」「超时(ms)」完整可见  
- [ ] 仅选中命令组时，「执行命令」禁用、「执行命令组」启用（反之亦然）  
- [ ] 选中命令组时，单条命令列表选中被清除（或反之）  
- [ ] 选中需输入命令时，右侧「参数输入」展开且标签可读  
- [ ] 列表选中态下命令名与 `adb …` 副标题对比度可接受  
- [ ] MinSize 下列表底项可通过滚动完整看到，无「半行永久遮挡」  
- [ ] 设置页完整路径可阅读（或输入框内可滚动到末尾）  

---

## 9. 附录：关键代码锚点

| 主题 | 路径 |
|---|---|
| Shell 布局 / 设备 / 状态栏 | `src/FactoryHelper/Shell/MainWindow.xaml` |
| 终端三栏 + 工具栏 | `src/FactoryHelper/Modules/AdbTerminal/Views/TerminalView.xaml` |
| 输入列宽切换 | `.../TerminalView.xaml.cs` |
| CanExecute | `.../ViewModels/TerminalViewModel.cs` |
| 命令库管理 | `.../Views/CommandManagerWindow.xaml` |
| Token | `src/FactoryHelper/Resources/ThemeTokens.xaml` |
| 设备多选行为 | `src/FactoryHelper/Core/SelectedItemsBehavior.cs` |

---

*本报告基于 2026-08-11 真实进程联调；若后续布局已改，请以回归清单第 8 节为准复测。*
