/**
 * 日志页右键场景表。Tab 与列表分行，动作经 ctx 注入。
 */

import { defineContextMenu } from "@yohu/ui";

export type LogsTabMenuAction = "rename" | "duplicate" | "close-others";

export interface LogsTabMenuCtx {
  rename: () => void;
  duplicate: () => void;
  closeOthers: () => void;
}

export const logsTabMenu = defineContextMenu<LogsTabMenuCtx, LogsTabMenuAction>({
  id: "logs.tab",
  items: () => [
    { id: "rename", label: "重命名" },
    { id: "duplicate", label: "复制会话" },
    { id: "close-others", label: "关闭其他" },
  ],
  onSelect: (id, ctx) => {
    switch (id) {
      case "rename":
        ctx.rename();
        return;
      case "duplicate":
        ctx.duplicate();
        return;
      case "close-others":
        ctx.closeOthers();
        return;
      default: {
        const _gone: never = id;
        return _gone;
      }
    }
  },
});

export type LogsRowMenuAction = "copy";

export interface LogsRowMenuCtx {
  canCopy: boolean;
  copy: () => void;
}

export const logsRowMenu = defineContextMenu<LogsRowMenuCtx, LogsRowMenuAction>({
  id: "logs.row",
  items: (ctx) => [{ id: "copy", label: "复制", disabled: !ctx.canCopy }],
  onSelect: (id, ctx) => {
    if (id === "copy") ctx.copy();
  },
});
