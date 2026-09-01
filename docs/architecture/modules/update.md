# 模块：应用更新

- 能力：`yohu-update`（core，零 Tauri、零 adb）
- 固定 GitHub Releases（`yohurm/Windows-YoADBTools`）；无更新源切换
- **公开仓库检查更新不需要 token**（`GET /repos/.../releases/latest`）
- 仓库覆盖：环境变量 + `settings/update.json`（不要把 PAT 打进安装包）
- 安装包：打 `vX.Y.Z` 标签 → `.github/workflows/release.yml` 打包 NSIS 并挂到该 tag 的 GitHub Release
- IPC：`update.check` / `update.info` / `update.download` / `update.install` / `update.cancel` / `update.open`
- 事件：`update/progress`（200ms 节流；阶段切换必达）
- 不使用 `tauri-plugin-updater`
- UI 不单独成模块：设置「关于」版本行绑 `update.*`；YoUI 零 IPC，不进 `@yohu/ui` / `modules/*`

## 覆盖安装

1. `update.download` 把 NSIS `*-setup.exe` 下到 `%TEMP%\YohuAdbTools-update\`（不进 INSTDIR），流式 SHA-256（GitHub `digest` 有则校验）
2. `update.install` 拉起脱离作业对象的助手：等当前 PID 退出 → `setup.exe /S`（per-user 覆盖 `%LOCALAPPDATA%\YohuAdbTools`）→ 启动新主程序
3. 壳在拉起助手后 `root_cancel` + 退出，以便覆盖正在运行的 `YohuAdbTools.exe` / sidecar
4. `settings/` `logs/` `data/` 不在安装包文件列表里，覆盖安装会保留
5. `update.open` 仅作浏览器兜底（无 `.exe` 附件时）

## Token

安装包里不要打 PAT（`YOHU_GITHUB_TOKEN` / `update.json` 的 `github.token`）。公开仓匿名限额足够按钮点「检查更新」。

CI 发版用 workflow 的 `GITHUB_TOKEN`（`permissions.contents: write`），不必另建 PAT。

若本机 `gh release create` / `scripts/publish-github-release.ps1` 上传安装包，Fine-grained PAT：

| 项 | 值 |
|----|----|
| Resource owner | `yohurm` |
| Repository access | 仅 `Windows-YoADBTools` |
| Contents | **Read and write**（建 Release、传附件） |
| Metadata | Read（自动） |
| 其余仓库/账号权限 | **No access** |

不要勾选 Administration、Issues、Pull requests、Secrets、Workflows。过期建议 90 天。聊天里出现过的 PAT 一律作废重建。
