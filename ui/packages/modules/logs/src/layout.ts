/**
 * 日志清单列规格：表头与行共用；显示列由设置 `log_display_columns` 裁剪。
 */

import type { LogDisplayColumns } from "@yohu/api";

export type LogMetaColKey = keyof LogDisplayColumns;
export type LogColKey = LogMetaColKey | "msg";
export type LogColAlign = "start" | "end" | "center";

export interface LogColumnSpec {
  key: LogColKey;
  header: string;
  width: string;
  align?: Exclude<LogColAlign, "start">;
}

export const DEFAULT_LOG_DISPLAY_COLUMNS: LogDisplayColumns = {
  ts: true,
  uid: true,
  pid: true,
  tid: true,
  level: true,
  tag: true,
};

/** 定宽轨道；消息列吃剩余。级别 4ch 以容纳表头「级别」。 */
export const LOG_COLUMNS: readonly LogColumnSpec[] = [
  { key: "ts", header: "时间", width: "18ch" },
  { key: "uid", header: "UID", width: "10ch" },
  { key: "pid", header: "PID", width: "6ch", align: "end" },
  { key: "tid", header: "TID", width: "6ch", align: "end" },
  { key: "level", header: "级别", width: "4ch", align: "center" },
  { key: "tag", header: "Tag", width: "24ch" },
  { key: "msg", header: "消息", width: "minmax(0, 1fr)" },
];

export function visibleLogColumns(display: LogDisplayColumns): LogColumnSpec[] {
  return LOG_COLUMNS.filter((col) => {
    if (col.key === "msg") return true;
    return display[col.key];
  });
}

export function logColTemplate(display: LogDisplayColumns): string {
  return visibleLogColumns(display)
    .map((col) => col.width)
    .join(" ");
}
