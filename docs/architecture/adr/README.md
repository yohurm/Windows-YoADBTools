# ADR-v6 索引

主表曾在单体 `架构设计-v6.md` §14。现以本目录为准。

| ID | 决策 | 结论 |
|----|------|------|
| 001 | 重建 | 推倒重来；v5 已下线 |
| 002 | 语言 | Rust core + TypeScript UI |
| 003 | 载体 | Tauri 2 + WebView |
| 004 | 框架 | SolidJS |
| 005 | core 边界 | core 零 Tauri |
| 006 | 采集 | 每设备一路；过滤在消费端；replay 读环 |
| 007 | 批量 IPC | 100–200ms；丢推送不丢环；投屏帧见 024 |
| 008 | ADB | sidecar 官方 adb.exe |
| 009 | 判定 | CommandEvaluator 在 domain |
| 010 | 日志分离 | AppLog 内存环 vs logcat |
| 011 | 组件库 | YoUI / `@yohu/ui` token 单源 |
| 012 | 模块 | 静态组合；`apps/shell` 组合点 |
| 013 | 安全根 | check / check_descendant |
| 014 | 部署 | NSIS per-user + WebView2 bootstrapper |
| 015 | 投屏 | scrcpy-server 4.1 + 自写客户端 + 壳内呈现 |
| 016 | 采集控制面 | 槽位 + generation；仅 Live adopt |
| 017 | 动效 | 见 `动画系统-v6.md` |
| 018 | 拖拽 | 见 `文件拖拽-v6.md` |
| 019 | 右键 | 见 `右键菜单-v6.md` |
| 020 | 事件名 | `/` 分层；invoke 仍点分 |
| [021](ADR-v6-021.md) | 日志导出真相 | **开放：** 环 vs session-logs |
| [022](ADR-v6-022.md) | 更新通道 | GitHub Releases；非 plugin-updater |
| [023](ADR-v6-023.md) | 投屏画质（旧） | **被 024 取代：** Channel + WebCodecs |
| [024](ADR-v6-024.md) | 投屏原生呈现 | 进程内 MF + HWND，禁止 ffmpeg.exe |
| [025](ADR-v6-025.md) | 设备状态 | 目录 ≠ 运行时；Hub 统一采样；禁模块轮询 |
