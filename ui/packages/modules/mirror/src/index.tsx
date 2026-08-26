/**
 * 投屏模块：每设备一路画面，嵌在工作台面板。
 * 只导出 descriptor；注册由 apps/shell 完成。
 */

import { ModuleId } from "@yohu/api";

import { MirrorView } from "./MirrorView";

export const descriptor = {
  id: ModuleId.Mirror,
  title: "投屏显示",
  icon: "mirror" as const,
  selectionMode: "singleRequired" as const,
  Component: MirrorView,
};
