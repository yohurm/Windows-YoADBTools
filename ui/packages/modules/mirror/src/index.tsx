/**
 * 投屏模块 — Planned 占位（仅导航 + 「开发中」页）。
 */

import { registerModule } from "@yohu/app";
import { YoChrome, YoEmptyState, YoToolbar } from "@yohu/ui";

registerModule({
  id: "screen-mirror",
  title: "投屏显示",
  icon: "mirror",
  selectionMode: "none",
  isPlanned: true,
  Component: () => (
    <>
      <YoChrome>
        <YoToolbar variant="chrome">
          <span class="yohu-module-title">投屏显示</span>
        </YoToolbar>
      </YoChrome>
      <YoEmptyState icon="mirror" title="投屏显示" description="模块开发中，敬请期待" />
    </>
  ),
});
