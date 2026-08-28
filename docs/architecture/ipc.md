# IPC 协议

事件名 `/` 分层（ADR-v6-020，Tauri 2.9 禁止点号）；invoke **命令名**仍点分。常量：`yohu-protocol::event_names` ↔ `@yohu/api` `EVENT_NAMES`。

错误：各 crate 自有 Error → 壳映射 `IpcError { code, message }`。不设统一 `YohuError`。

## invoke

| 命令 | 说明 |
|------|------|
| `device.refresh` | `devices -l`；推 `devices/changed` |
| `adb.exec` | 短命令 |
| `terminal.eval` / `group.run` / `group.cancel` | 领域判定 + 组编排 |
| `commandlib.load` / `save` | 命令库；损坏备份后默认库 |
| `files.list` / `push` / `pull` / `cancel` / `delete` / `mkdir` / `create` / `dragOut` | 安全根在 core |
| `log.capture.start/stop/status` | 仅 Live adopt；generation |
| `log.clear` / `log.clearDevice` / `log.replay` / `log.processSnapshot` | 环 / logcat -c / 回补 / ps |
| `log.sessionFileOpen/Append/Close/Latest/List` | 逐窗口实时文件（见 ADR-v6-021） |
| `log.export` | **现状：** 合并 session-logs 源文件（不是环快照） |
| `mirror.start/stop/status/inject/closeControl/savePng` | 投屏槽位 |
| `settings.get` / `settings.set` | 全量快照事件 |
| `system.info` / `openPath` / `reportError` / `log` | 关于 / 打开路径 / 上报 |
| `update.check` / `info` / `open` | ADR-v6-022 |

本机选路走 `@yohu/api` 的 `dialogOpen*` / `dialogSaveFile`（封装 `tauri-plugin-dialog`）。窗口三键仅 `@yohu/workbench` `window-chrome.ts`。

## 事件

| 事件 | 节流 |
|------|------|
| `devices/changed` / `device/offline` | 扫描 / 掉线即发（offline 必达） |
| `log/lines` | 100–200ms / 1000 行 / 512KB；可丢推送 |
| `log/processIndex` | 2.5s |
| `log/captureState` | 必达 |
| `log/overflow` | 丢批计数 |
| `transfer/progress` | Running 200ms 可丢；终态必达 |
| `group/progress` / `task/summary` | 命令/任务 |
| `settings/changed` | 必达；带全量快照 |
| `mirror/state` | 必达 |
| `mirror/packet` | 逐帧 `try_send`，可丢帧 |

## 背压

RingBuffer seq 单调；Batcher 有界 mpsc 满则丢**推送**不丢环；UI 经 overflow + `log.replay` 补镜像。

**导出：** 文档曾写「导出永远读环」。实现是 UI 过滤行写入 `session-logs`，`log.export` 合并这些文件（ADR-v6-021）。replay 仍读环。
