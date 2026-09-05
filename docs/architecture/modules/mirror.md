# 模块：投屏

- 能力：`yohu-mirror` 解复用 + 槽位；壳 `mirror_present` 编译期系统硬解呈现（ADR-v6-024/026/027/028；Windows = MF）
- 官方未改 `scrcpy-server` 4.1 sidecar；禁止拉起 `scrcpy.exe`（ADR-v6-015）
- 槽位与采集同构：仅 Live adopt；`mirror/state` 必达；首帧 `mirror/painted`
- 长驻 `app_process` 的杀树走 `yohu_runtime::kill_tree`

## 管道

```text
设备 MediaCodec（协议：usb / wifi；USB 优先 HEVC）
  → ADB reverse 或 forward（可 warmup 预挂）
  → yohu-mirror 解复用 + FramePipe（sticky last config；8 帧，先丢 delta；呈现线程直取）
  → 壳 AnnexBDecoder（编译期后端；Windows = MF 硬件 MFT + DXGI）
  → 壳表面 Present（Windows = D3D11 VP + WS_CHILD HWND + DComp clip）
```

core 零 Tauri：`FramePipe` 在 `yohu-mirror`；解码 / 窗体 / GPU 只在 `yohu-adbtools`（ADR-v6-028）。macOS VideoToolbox / Linux VA-API 预留，本期不交付像素。

`mirror.start` 只传 `serial/control/connection/session_quality_touched`；编码参数由壳从 `yohu-domain` 解析。

## 投屏协议

| 协议 | 长边 | 码率 | max_fps | 编码 | 何时 |
|------|------|------|---------|------|------|
| usb | 0（原始） | 16 Mbps | 0（不限） | h265（失败 h264） | USB 默认 |
| wifi | 1280 | 4 Mbps | 30 | h264 | `connection` 以 `tcp:` 开头且本会话未改质量 |

选协议写入上表。改长边 / 码率 / 帧率不另立协议。`max_size=0` 表示设备原始，**不再封顶 1920**。`max_fps=0` 不向 server 传帧率上限。

## 呈现

- 占用：舞台是透明洞，HWND 铺满 avail；可见占用卡片是 DirectComposition clip，按画面 contain（ADR-v6-027）。HWND 是主窗 **WS_CHILD**。UI 只报 `.yohu-mirror__avail` 客户区物理矩形；会话中壳用 FramePipe 编码尺寸把 clip 收到 `contain_in_zone`，idle clip 铺满 HWND。fill↔contain 走 `IDCompositionAnimation`（300ms 标准曲线），主窗改尺寸瞬时跟 HWND。拖动由 USER32 带着走。主窗最小 1024×768（`Layout.WindowMin*`），保证竖屏 contain 短边 ≥280 CSS。禁止运行时 UI `containInZone`、禁止 CSS 占用宽高过渡、禁止用 `SetWindowPos` 改子窗尺寸做占用过渡
- `mirror.layout`：客户区物理像素 `{x,y,w,h,visible,…}` + 会话旗标 `{dpr,fullscreen,paused,control,has_device,failed,error,dark}`。报稳定 avail 格子，不是 contain 目标，不是视觉插值盒。禁止 `video_width` / `stroke_px`。编码尺寸只来自 FramePipe；present 在 stop 后保留上次尺寸
- 整数倍（误差 &lt; 1%）吸附后最近邻；否则由 D3D11 Video Processor 缩放
- 拖拽主窗：子窗自动跟；改尺寸在 owner `WM_WINDOWPOSCHANGING` 瞬时跟盒。侧栏每帧跟住。面板内全屏只藏操作栏/功能栏，页眉可点，Esc 退出。呈现线程跟子窗尺寸 `ResizeBuffers`；禁止 `SetWindowPos`；`SetWindowPos` 禁止 `SWP_NOCOPYBITS`
- **舞台占用（ADR-v6-026）：** HWND 生命周期跟可用区可见性走，解码管道跟 start/stop 走。空态/加载/暂停由同一 HWND 用 Direct2D 绘制（文案、surface、hairline 在壳内）。WebView 舞台是透明洞，不是 YoPanel。停止投屏不解 HWND。离开投屏页 `visible=false` 才 `DestroyWindow`
- **呈现类型（两段寿命）：** `Stage`（OS 无关）是占用/模式/chrome 的唯一开关，`bound` 只在 BindPipe/UnbindPipe 写入。Windows 上 `Host` 持 GPU+Stage+输入（跟 HWND）；`DecodeBind` 持 FramePipe+MF（跟 start/stop，不碰 HWND）。呈现线程只调度 `Cmd`，禁止再用 `session` bool 与管道双轨
- 截图：`mirror.screenshot` 按视频分辨率从 last NV12 纹理导出（不是交换链 letterbox）
- 实测 fps：1s 窗口已 Present 帧，进状态栏右槽，不盖画面

## UI

`@yohu/module-mirror`；默认可操作；页眉「仅显示」关控制通道。质量参数下次 `mirror.start` 生效。页眉与画面都不放实测 fps。导航/音量/电源/亮度在画面与设置栏之间的设备操作栏；月亮/太阳同一钮读 **`DeviceSession.deviceStatuses`** 的 `night` 并 `device.setNightMode`（不是工作台 theme，禁止本页轮询）。状态采样见 [device.md](device.md)。
