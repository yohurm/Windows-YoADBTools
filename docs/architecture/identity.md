# 产品身份与命名单源

> 常量在 `yohu-protocol`（`PRODUCT_NAME` / `DISPLAY_NAME` / `IDENTIFIER` / `DESCRIPTION` / `COPYRIGHT` / `DATA_DIR_NAME` / `module_id::*` / `dir::*`）。  
> 版本号 = Cargo workspace `version`（`CARGO_PKG_VERSION`）；`tauri.conf.json` 由 `yohu-adbtools/build.rs` 校验一致。UI 禁止再写死版本号或展示名。

## 命名

| 用途 | 取值 |
|------|------|
| 产品 / NSIS `productName` / 主程序 | `YohuAdbTools` |
| 窗口标题 / 状态栏 / 关于 | `Yohu ADB Tools` |
| 包标识 | `com.yohu.adbtools` |
| 数据目录 | `%LOCALAPPDATA%\YohuAdbTools\`（非 Windows 见 `yohu-runtime::os_paths`） |
| Tauri 壳 crate | **`yohu-adbtools`**（`app/yohu-adbtools`；唯一引用 Tauri） |
| 前端工作台包 | **`@yohu/workbench`**（`ui/packages/workbench`） |
| 组件库对外名 | **YoUI**；npm 包仍 `@yohu/ui` |
| IPC 门面 | `@yohu/api` |
| 模块 | `@yohu/module-{terminal,files,logs,mirror}` |
| 图标 | `app/yohu-adbtools/icons/`；UI 同源 `/app-icon.png` |

`system.info` 返回 `{ identity, paths, adb_path, adb_in_use, settings }`。

## 路径规划

```text
<os_app_data>/<DATA_DIR_NAME>/     # local_root（不随 data_root 迁移）
├── settings/settings.json
├── settings/update.json           # 更新通道密钥/仓库覆盖（ADR-v6-022）
├── logs/                          # app-*.log + panic-*.log
└── data/                          # DataRoot（可配，重启生效）
    ├── tools/adb/
    └── modules/
        ├── adb-terminal/config/library.json
        ├── log-analyzer/exports/ + session-logs/
        └── file-manager/drag-out/
```

产品子路径由壳 `AppPaths` 用 `dir::*` 拼装；OS 根只经 `yohu_runtime::app_data_root`。
