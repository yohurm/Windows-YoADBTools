/**
 * 投屏模块 — Planned 占位（仅导航 + 「开发中」页）。
 */

import { registerModule } from "@yovo/app";
import { YoEmptyState } from "@yovo/ui";

registerModule({
  id: "screen-mirror",
  title: "投屏显示",
  icon: "mirror",
  selectionMode: "none",
  isPlanned: true,
  Component: () => (
    <YoEmptyState icon="mirror" title="投屏显示" description="模块开发中，敬请期待" />
  ),
});
