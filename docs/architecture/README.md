# Yohu ADB Tools — 架构（as-built）

> **状态：** 已落地（S1–S4 + 投屏主路径）；2026-08 起重规划：`yohu-runtime` ∥ `yohu-protocol`，壳 crate `yohu-adbtools`，前端壳 `@yohu/workbench`。  
> **需求：** [`docs/requirements/需求分析.md`](../requirements/需求分析.md)

**一句话：** Rust 领域核心 + Tauri 2 窗口/IPC + SolidJS WebView UI（YoUI）。本期交付 Windows x64；OS 差异收口在 `yohu-runtime`，不在本期交付 macOS/Linux。

## 文档地图

| 文档 | 内容 |
|------|------|
| [identity.md](identity.md) | 产品名 / crate / 前端包 / 路径目录单源 |
| [layers.md](layers.md) | runtime ∥ protocol → domain → adb → capability → 壳 |
| [ipc.md](ipc.md) | invoke 命令、事件、背压 |
| [youi.md](youi.md) | `@yohu/ui`（对外名 YoUI） |
| [workbench.md](workbench.md) | `@yohu/workbench` + `apps/shell` |
| [modules/](modules/) | terminal / files / logs / mirror / update |
| [adr/](adr/) | ADR-v6-001～023 |
| [UI设计系统-v6.md](UI设计系统-v6.md) | token / 密度 / 主题 |
| [动画系统-v6.md](动画系统-v6.md) | 动效（ADR-v6-017） |
| [右键菜单-v6.md](右键菜单-v6.md) | 右键引擎（ADR-v6-019） |
| [文件拖拽-v6.md](文件拖拽-v6.md) | Explorer 拖入拖出（ADR-v6-018） |

旧入口 [`架构设计-v6.md`](架构设计-v6.md) 仅为跳转页，正文已拆到上表。

## 依赖方向（硬规则）

```text
UI → @yohu/api → IPC ← commands ← core
yohu-runtime ∥ yohu-protocol（互不依赖）
yohu-domain → yohu-protocol
yohu-adb → yohu-runtime + protocol + domain
yohu-{files,logsrv,mirror} → yohu-adb（设备运输）
yohu-update → protocol + runtime（禁止 adb）
yohu-adbtools = 唯一 Tauri crate
```

禁止：core 引 Tauri；capability 互引；模块引 `@yohu/workbench` / `@tauri-apps/*`；runtime 知道产品 wire 类型。
