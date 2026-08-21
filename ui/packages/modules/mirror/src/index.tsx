/**
 * 投屏模块 — Planned 占位（仅导航 + 「开发中」页）。
 * 只导出 descriptor；注册由 apps/shell 完成（模块不依赖 @yohu/app）。
 */

import { ModuleId } from "@yohu/api";

import { MirrorView } from "./MirrorView";

export const descriptor = {
  id: ModuleId.Mirror,
  title: "投屏显示",
  icon: "mirror" as const,
  selectionMode: "none" as const,
  isPlanned: true,
  Component: MirrorView,
};
