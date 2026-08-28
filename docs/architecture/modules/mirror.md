# 模块：投屏

- 能力：`yohu-mirror`；官方未改 `scrcpy-server` 4.1 sidecar；客户端自写（reverse 优先 / forward+dummy / 12B 解复用）
- 禁止拉起 `scrcpy.exe`（ADR-v6-015）
- 槽位与采集同构：仅 Live adopt；`mirror/state` 必达；`mirror/packet` 逐帧可丢
- 长驻 `app_process` 的杀树走 `yohu_runtime::kill_tree`
- UI：`@yohu/module-mirror`；WebCodecs 画进 `YoPanel`；默认只读；质量参数下次 `mirror.start` 生效
