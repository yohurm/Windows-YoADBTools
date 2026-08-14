/**
 * ADB 命令终端模块（S1 骨架占位；S2 交付命令库/组/判定全功能）。
 */

import { registerModule } from "@yovo/app";
import { YEmptyState } from "@yovo/ui";

registerModule({
  id: "adb-terminal",
  title: "ADB 命令终端",
  icon: "terminal",
  selectionMode: "multiOptional",
  Component: () => (
    <YEmptyState
      icon="terminal"
      title="ADB 命令终端"
      description="S2 阶段交付：命令库 / 命令组 / 多设备并行 / 成败判定"
    />
  ),
});
