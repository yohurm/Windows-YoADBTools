# 模块：应用更新

- 能力：`yohu-update`（core，零 Tauri、零 adb）
- 默认 GitHub Releases（`yohurm/Windows-YoADBTools`）；可选蒲公英（ADR-v6-022）
- **公开仓库检查更新不需要 token**（`GET /repos/.../releases/latest`）
- 密钥与仓库覆盖：环境变量 + `settings/update.json`；设置项只选 `UpdateProvider`
- 安装包：打 `vX.Y.Z` 标签 → `.github/workflows/release.yml` 打包 NSIS 并挂到该 tag 的 GitHub Release
- IPC：`update.check` / `update.info` / `update.open`
- 不使用 `tauri-plugin-updater`

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
