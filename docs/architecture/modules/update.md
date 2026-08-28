# 模块：应用更新

- 能力：`yohu-update`（core，零 Tauri、零 adb）
- 默认 GitCode Releases；可选 GitHub / 蒲公英（ADR-v6-022）
- 密钥与仓库覆盖：环境变量 + `settings/update.json`；设置项只选 `UpdateProvider`
- IPC：`update.check` / `update.info` / `update.open`
- 不使用 `tauri-plugin-updater`
