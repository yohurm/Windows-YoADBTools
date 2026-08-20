/**
 * 文件页快捷键策略：绑定表 + 远程路径复制格式。
 */

import { whenList, whenPanel, type KeyBinding } from "@yohu/ui";

import { joinPath } from "./model";

export type FilesKeyAction = "select-all" | "copy" | "delete" | "refresh" | "go-up" | "open";

export const FILES_LIST_SELECTOR = ".yohu-files__table-list";

export const FILES_KEY_BINDINGS: readonly KeyBinding<FilesKeyAction>[] = [
  { action: "select-all", key: "a", ctrl: true, when: whenList },
  { action: "copy", key: "c", ctrl: true, when: whenList },
  { action: "delete", key: "delete", when: whenList },
  { action: "open", key: "enter", when: whenList },
  { action: "go-up", key: "backspace", when: whenList },
  { action: "refresh", key: "f5", when: whenPanel },
];

export function copyRemotePaths(dir: string, names: readonly string[]): string {
  return names.map((name) => joinPath(dir, name)).join("\n");
}
