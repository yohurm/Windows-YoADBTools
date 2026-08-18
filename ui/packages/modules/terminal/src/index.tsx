/**
 * ADB 命令终端模块（S2）：命令库 / 命令组 / 多设备并行 / 成败判定 / 命令管理。
 */

import { registerModule } from "@yohu/app";

import { TerminalView } from "./TerminalView";

registerModule({
  id: "adb-terminal",
  title: "ADB 命令终端",
  icon: "terminal",
  selectionMode: "multiOptional",
  Component: TerminalView,
});
