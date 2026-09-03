# 工作台壳（`@yohu/workbench` + `apps/shell`）

Rust 壳是 `yohu-adbtools`。前端工作台包是 **`@yohu/workbench`**（不再叫 `@yohu/app`，以免与产品/crate 撞名）。

`apps/shell` 是**唯一组合点**：`registerModule(descriptor)`。模块只依赖 `@yohu/api` + `@yohu/ui`；禁止依赖 `@yohu/workbench`、禁止模块互引（`scripts/check-ui-deps.mjs`）。

## 模块契约

```typescript
interface ModuleDescriptor {
  id: string;              // module_id::*
  title: string;
  icon: IconName;
  selectionMode: "none" | "singleRequired" | "multiOptional";
  kind?: "workspace" | "system";
  isPlanned?: boolean;
  Component: Component<DeviceSession>;
  Status?: Component;      // 状态栏右槽；无内容时不输出节点
}
```

壳注入 `DeviceSession`（焦点、执行目标、设备目录、**运行时状态**、设置快照）。模块不读壳 store、不自拼页眉设备名、不轮询设备 dumpsys。设置只读注入快照（启动 `system.info`，变更 `settings/changed`）。模块 store 在模块内部创建（不经 descriptor `createStore`）。

## 数据链

```text
adb devices -l → device_catalog.last_devices（唯一目录）
  写：device.refresh / 启动预热 / 自动刷新
  读：device.list、devices/changed、require_online
Online serial → yohu-adb::DeviceStatusHub（唯一运行时状态）
  写：2s 采样 / device.setNightMode
  读：device.status、device/status
DeviceRail → deviceStore（目录 + statuses 投影）→ resolve_targets → DeviceSession
settings.json → settings.set / settings/changed → settingsStore → DeviceSession.settings
```

成功扫描（含空列表）整表替换目录。扫描失败不改目录。禁止用上次快照顶替空扫描。

选择策略在 domain 与 TS 各有一份，testdata JSON 对齐（点击不能等 IPC）。

## Tauri 壳（`app/yohu-adbtools`）

薄命令层：反序列化 → core → 序列化。编排在 `device_catalog` / `library_store` / `group_runs`。设备运行时状态在 `yohu-adb::DeviceStatusHub`（[modules/device.md](modules/device.md)，ADR-v6-025）。`dnd/` 仅 Windows OLE 拖出（[文件拖拽-v6.md](文件拖拽-v6.md)）。退出：根 `CancellationToken` → 3s 强杀进程树 → flush 设置。
