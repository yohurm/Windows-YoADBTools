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
}
```

壳注入 `DeviceSession`（焦点、执行目标、设备目录、设置快照）。模块不读壳 store、不 `settings.get`、不自拼页眉设备名。模块 store 在模块内部创建（不经 descriptor `createStore`）。

## 数据链

```text
DeviceRail → deviceStore → resolve_targets → DeviceSession.selectedSerials
settings.json → settings.set / settings/changed → settingsStore → DeviceSession.settings
```

选择策略在 domain 与 TS 各有一份，testdata JSON 对齐（点击不能等 IPC）。

## Tauri 壳（`app/yohu-adbtools`）

薄命令层：反序列化 → core → 序列化。编排在 `device_catalog` / `library_store` / `group_runs`。`dnd/` 仅 Windows OLE 拖出（[文件拖拽-v6.md](文件拖拽-v6.md)）。退出：根 `CancellationToken` → 3s 强杀进程树 → flush 设置。
