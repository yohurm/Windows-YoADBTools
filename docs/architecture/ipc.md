# IPC 协议

事件名 `/` 分层（ADR-v6-020，Tauri 2.9 禁止点号）；invoke **命令名**仍点分。常量：`yohu-protocol::event_names` ↔ `@yohu/api` `EVENT_NAMES`。

错误：各 crate 自有 Error → 壳映射 `IpcError { code, message }`。不设统一 `YohuError`。

## invoke

| 命令 | 说明 |
|------|------|
| `device.list` | 读目录快照，不跑 adb |
| `device.refresh` | `devices -l` 整表替换目录；推 `devices/changed`；先前在线且本次名单没有的 serial 推 `device/offline` |
| `adb.exec` | 短命令 |
| `terminal.eval` / `group.run` / `group.cancel` | 领域判定 + 组编排 |
| `commandlib.load` / `save` | 命令库；损坏备份后默认库 |
| `files.list` / `push` / `pull` / `cancel` / `delete` / `mkdir` / `create` / `dragOut` | 安全根在 core |
| `log.capture.start/stop/status` | 仅 Live adopt；generation |
| `log.clear` / `log.clearDevice` / `log.replay` / `log.processSnapshot` | 环 / logcat -c / 回补 / ps |
| `log.sessionFileOpen/Append/Close/Latest/List` | 逐窗口实时文件（见 ADR-v6-021） |
| `log.export` | **现状：** 合并 session-logs 源文件（不是环快照） |
| `mirror.start/stop/inject/closeControl/layout/screenshot` | 投屏槽位；画面在壳内 Present（ADR-v6-024）。`mirror.start` 只传 `serial/control/connection/session_quality_touched`。`mirror.layout` 为可用区相对主窗客户区的物理矩形 + `corner_radius`。Live 状态只信 `mirror/state`，无 `mirror.status` |
| `settings.get` / `settings.set` | 全量快照事件 |
| `system.info` / `openPath` / `reportError` / `log` | 关于 / 打开路径 / 上报 |
| `update.check` / `info` / `download` / `install` / `cancel` / `open` | ADR-v6-022 |

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
| `mirror/painted` | 首帧必达；之后 1s 窗口 fps |
| `update/progress` | 下载 200ms 可丢；阶段切换必达 |

## 背压

RingBuffer seq 单调；Batcher 有界 mpsc 满则丢**推送**不丢环；UI 经 overflow + `log.replay` 补镜像。

**导出：** 文档曾写「导出永远读环」。实现是 UI 过滤行写入 `session-logs`，`log.export` 合并这些文件（ADR-v6-021）。replay 仍读环。

**投屏帧：** 不进 JS。`yohu-mirror::FramePipe` 有界 8 帧，sticky 最后一份 config（先丢 delta，不丢 config）；**呈现线程 `try_recv` 直取**，禁止再泵进无界通道。满则丢待发帧，不影响设备 TCP。`mirror.start` 只传 `serial/control/connection/session_quality_touched`。
