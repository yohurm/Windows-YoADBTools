/**
 * 投屏占位页（Planned）：只贡献导航 +「开发中」空态。
 */

import { YoChrome, YoEmptyState, YoPage, YoPanel } from "@yohu/ui";

export function MirrorView() {
  return (
    <YoPage class="yohu-mirror">
      <YoChrome title="投屏显示" />
      <YoPanel variant="pane">
        <YoEmptyState icon="mirror" title="模块开发中" description="敬请期待" />
      </YoPanel>
    </YoPage>
  );
}
