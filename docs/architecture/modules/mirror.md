# 模块：投屏

- 能力：`yohu-mirror` 解复用 + 槽位；壳 `mirror_present` 解码呈现（ADR-v6-024）
- 官方未改 `scrcpy-server` 4.1 sidecar；禁止拉起 `scrcpy.exe`（ADR-v6-015）
- 槽位与采集同构：仅 Live adopt；`mirror/state` 必达；首帧 `mirror/painted`
- 长驻 `app_process` 的杀树走 `yohu_runtime::kill_tree`

## 管道

```text
设备 MediaCodec（协议：usb / wifi；USB 优先 HEVC）
  → ADB reverse 或 forward（可 warmup 预挂）
  → yohu-mirror 解复用 + FramePipe（sticky last config；8 帧，先丢 delta；呈现线程直取）
  → 壳 MF 硬件 MFT（DXGI 设备管理器）→ D3D11 Video Processor
  → 对齐 YoPanel 的 WS_POPUP HWND
```

core 零 Tauri：`FramePipe` 在 `yohu-mirror`；HWND / MF / D3D 只在 `yohu-adbtools`。

`mirror.start` 只传 `serial/control/connection/session_quality_touched`；编码参数由壳从 `yohu-domain` 解析。

## 投屏协议

| 协议 | 长边 | 码率 | max_fps | 编码 | 何时 |
|------|------|------|---------|------|------|
| usb | 0（原始） | 16 Mbps | 0（不限） | h265（失败 h264） | USB 默认 |
| wifi | 1280 | 4 Mbps | 30 | h264 | `connection` 以 `tcp:` 开头且本会话未改质量 |

选协议写入上表。改长边 / 码率 / 帧率不另立协议。`max_size=0` 表示设备原始，**不再封顶 1920**。`max_fps=0` 不向 server 传帧率上限。

## 呈现

- 面板 contain 贴合（`--mirror-w/--mirror-h`）；舞台透明占位，原生 HWND 盖在物理矩形上
- `mirror.layout`：屏幕物理像素 `{x,y,w,h,visible}`；禁止 CSS 二次缩放画面
- 整数倍（误差 &lt; 1%）吸附后最近邻；否则由 D3D11 Video Processor 缩放（厂商投屏同款，不是 CPU 双线性）
- 面板铬 `yohu-recipe-mirror-frame`（spatialPanel）过渡；HWND 经舞台 ResizeObserver 跟盒；禁止 CSS 缩放视频
- Live 未出画：HWND 隐藏，overlay 盖舞台
- 截图：`mirror.screenshot` 按视频分辨率从 last NV12 纹理导出（不是交换链 letterbox）
- 实测 fps：1s 窗口已 Present 帧，进状态栏右槽，不盖画面

## UI

`@yohu/module-mirror`；默认只读；质量参数下次 `mirror.start` 生效。页眉与画面都不放实测 fps。
