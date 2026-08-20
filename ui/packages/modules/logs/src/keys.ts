/**
 * 日志页快捷键策略：绑定表 + 复制格式。宿主与选区代数在 @yohu/ui keymap。
 */

import type { LogLine } from "@yohu/api";
import { whenIdle, whenPanel, whenPanelOrField, type KeyBinding } from "@yohu/ui";

import type { ViewRow } from "./pipeline";

export type LogsKeyAction =
  | "pause"
  | "clear"
  | "find"
  | "new-tab"
  | "close-tab"
  | "next-tab"
  | "select-all"
  | "copy";

export const LOGS_LIST_SELECTOR = ".yohu-logs__list";

/** 本页默认操作日志内容。Space 避开侧栏/按钮/页签，以免抢走激活。 */
export const LOGS_KEY_BINDINGS: readonly KeyBinding<LogsKeyAction>[] = [
  { action: "pause", key: "space", when: whenIdle },
  { action: "select-all", key: "a", ctrl: true, when: whenPanel },
  { action: "copy", key: "c", ctrl: true, when: whenPanel },
  { action: "find", key: "f", ctrl: true, when: whenPanelOrField },
  { action: "clear", key: "l", ctrl: true, when: whenPanel },
  { action: "new-tab", key: "t", ctrl: true, when: whenPanel },
  { action: "close-tab", key: "w", ctrl: true, when: whenPanel },
  { action: "next-tab", key: "tab", ctrl: true, when: whenPanel },
];

export function formatLogLine(line: LogLine): string {
  if (line.level === "?") return line.msg;
  const uid = (line.uid ?? "").padStart(8);
  const pid = String(line.pid).padStart(5);
  const tid = String(line.tid).padStart(5);
  const tag = line.tag.padEnd(8);
  return `${line.ts} ${uid} ${pid} ${tid} ${line.level} ${tag} ${line.msg}`.trimEnd();
}

export function copyLogText(
  rows: readonly ViewRow[],
  selected: ReadonlySet<string>,
  keyOf: (row: ViewRow) => string,
): string {
  return rows
    .filter((row) => selected.has(keyOf(row)))
    .map((row) => formatLogLine(row.line))
    .join("\n");
}
