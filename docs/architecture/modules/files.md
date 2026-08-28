# 模块：文件管理

- 能力 crate：`yohu-files`（browse / transfer / mutate）
- 安全根：`yohu-domain::SafetyRoot`（ADR-v6-013）；浏览 `check`；突变与传输 `check_descendant` + `validate_entry_name`；符号链接 `readlink -f` 复核
- UI：`@yohu/module-files`；`singleRequired`
- 传输：壳发号；Running 200ms `try_send`；终态必达；取消杀进程树；pull 失败删本机目标
- 拖拽：[文件拖拽-v6.md](../文件拖拽-v6.md)；IPC `files.dragOut`
- 右键：`files/src/menu.ts` → `openContextMenu`
