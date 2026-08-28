/**
 * ADB 命令终端模块（S2）：命令库 / 命令组 / 多设备并行 / 成败判定 / 命令管理。
 * 只导出 descriptor；注册由 apps/shell 完成（模块不依赖 @yohu/workbench）。
 */

import { ModuleId } from "@yohu/api";

import { TerminalView } from "./TerminalView";

export const descriptor = {
  id: ModuleId.Terminal,
  title: "ADB 命令终端",
  icon: "terminal" as const,
  selectionMode: "multiOptional" as const,
  Component: TerminalView,
};
