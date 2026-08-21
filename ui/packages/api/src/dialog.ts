/**
 * 本机文件选择器（Tauri dialog 插件的唯一入口）。
 * 模块与设置页禁止直接 import `@tauri-apps/plugin-dialog`。
 */

import { open, save } from "@tauri-apps/plugin-dialog";

export interface DialogFilter {
  name: string;
  extensions: string[];
}

export async function dialogOpenFile(options?: {
  title?: string;
  filters?: DialogFilter[];
}): Promise<string | null> {
  const selected = await open({
    title: options?.title,
    multiple: false,
    filters: options?.filters,
  });
  return typeof selected === "string" ? selected : null;
}

export async function dialogOpenDirectory(options?: { title?: string }): Promise<string | null> {
  const selected = await open({
    title: options?.title,
    directory: true,
    multiple: false,
  });
  return typeof selected === "string" ? selected : null;
}

export async function dialogSaveFile(options?: {
  title?: string;
  defaultPath?: string;
  filters?: DialogFilter[];
}): Promise<string | null> {
  const selected = await save({
    title: options?.title,
    defaultPath: options?.defaultPath,
    filters: options?.filters,
  });
  return typeof selected === "string" ? selected : null;
}
