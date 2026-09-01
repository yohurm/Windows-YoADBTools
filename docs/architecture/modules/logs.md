# 模块：日志分析

- 能力：`yohu-logsrv` — 每设备一路 logcat；槽位 Empty/Starting/Live/Stopping + generation（ADR-v6-016）
- 过滤：UI `pipeline.ts` + domain `log_filter`（replay 用）；共享 testdata
- 窗口 = 会话订阅（serial / capturing / fromSeq）；设备流按窗口引用计数启停；切焦点不停其他设备
- **UI store 分层：** `workspace`（Tab/过滤/重建）∥ `ingest`（批次按 serial 扇出）∥ `session-files`（ADR-v6-021 落盘）∥ `capture`（每设备启停/世代/溢出回补）。进程索引、世代、溢出按 serial 分桶，禁止全局一份 `processEntries` / `overflowed`
- 环：`buffer_capacity` 默认 10000；掉线清该 serial
- **会话文件（as-built，ADR-v6-021）：** UI 把已过滤行 `log.sessionFileAppend` 写入 `session-logs/`；`log.export` 合并源文件，不受环容量约束。追加失败目前只打控制台。
- UI：`@yohu/module-logs`；轨 `singleRequired`；多窗口可绑不同设备
- 快捷键：Space / Ctrl+L / F / T / W / Tab
