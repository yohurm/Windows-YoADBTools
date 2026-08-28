# 模块：ADB 命令终端

- 领域：`yohu-domain` 命令库 / `CommandEvaluator`（失败正则 → 成功正则 → 退出码）/ `GroupExecutor`
- 运输：`yohu-adb` 实现 `Runner`
- UI：`@yohu/module-terminal`；选择模式 `multiOptional`
- 数据：`DataRoot/modules/adb-terminal/config/library.json`（schemaVersion 2；损坏 `.corrupt-<ts>` 后写默认库）
- 编辑即快照：深拷贝、全量提交、取消零污染
- IPC：`terminal.eval` / `group.run` / `group.cancel` / `commandlib.*`；进度 `group/progress`
