# 模块：投屏

- 能力：`yohu-mirror`；官方未改 `scrcpy-server` 4.1 sidecar；客户端自写（reverse 优先 / `tcp:` 默认 forward / 12B 解复用）
- 禁止拉起 `scrcpy.exe`（ADR-v6-015）
- 槽位与采集同构：仅 Live adopt；`mirror/state` 必达
- 长驻 `app_process` 的杀树走 `yohu_runtime::kill_tree`
- 画质与包通道见 [ADR-v6-023](../adr/ADR-v6-023.md)

## 四段管道

```text
设备 MediaCodec（协议：usb / wifi）
  → ADB reverse 或 forward
  → yohu-mirror 解复用 + FramePipe（8 帧，先丢 delta）
  → 壳 Tauri Channel（二进制帧）
  → WebCodecs → WebGL/2D display×DPR → YoPanel
```

core 零 Tauri：`FramePipe` 在 `yohu-mirror`；`ipc::Channel` 只在 `yohu-adbtools` 泵。

## 投屏协议

| 协议 | 长边 | 码率 | max_fps | 何时 |
|------|------|------|---------|------|
| usb | 1920 | 8 Mbps | 0（不限） | USB 默认 |
| wifi | 1024 | 2 Mbps | 30 | `connection` 以 `tcp:` 开头且本会话未改质量 |

选协议写入上表参数。改长边 / 码率 / 帧率不另立协议。`max_size=0`（UI「原始」）编码器封顶 1920。`max_fps=0` 表示不向 server 传帧率上限。

## 二进制帧

32 字节小端头 + payload（Annex-B / avcC 原样）：

`version u8` `flags u8`（bit0=config，bit1=keyframe）`codec u8`（0=h264）`reserved u8` `width u32` `height u32` `dropped u32`（累计丢帧）`generation u64` `pts u64`

## 绘制

- 面板 contain 贴合（`--mirror-w/--mirror-h`）
- 舞台是叠层包含块：底层 canvas 铺满（display×DPR 的 CSS 盒）；空态/加载进 overlay，禁止与 canvas 共 flex 流
- 位图 = CSS 尺寸 × `devicePixelRatio`；禁止再把 `canvas.width` 设成视频分辨率
- Live 未出画：canvas `opacity:0` 仍铺满舞台（backing store 可测），禁止收成 1×1
- 截图：`lastFrame` 按视频分辨率离屏导出
- 实测 fps：1s 窗口已绘帧，进状态栏右槽（模块 `Status`），不盖画面

## UI

`@yohu/module-mirror`；默认只读；质量参数下次 `mirror.start` 生效。页眉与画面都不放实测 fps。
