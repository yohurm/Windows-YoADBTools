/**
 * 投屏模块 — Planned 占位（仅导航 + 「开发中」页）。
 * 页壳走 YoPage，与终端/文件/日志同一套 page-inset / page-gap；标题只在 YoChrome。
 */

import { registerModule } from "@yohu/app";
import { YoChrome, YoEmptyState, YoPage, YoPanel } from "@yohu/ui";

registerModule({
  id: "screen-mirror",
  title: "投屏显示",
  icon: "mirror",
  selectionMode: "none",
  isPlanned: true,
  Component: () => (
    <YoPage class="yohu-mirror">
      <YoChrome title="投屏显示" />
      <YoPanel variant="pane">
        <YoEmptyState icon="mirror" title="模块开发中" description="敬请期待" />
      </YoPanel>
    </YoPage>
  ),
});
