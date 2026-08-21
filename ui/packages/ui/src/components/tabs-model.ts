/**
 * 标签页键盘意图（L2）。视图只消费这些纯函数。
 */

export type TabsKeyIntent = { type: "activate"; index: number } | { type: "close"; index: number };

/** 未识别返回 null（视图不 preventDefault）。activeIndex < 0 时箭头从 0 起算，Delete 不关闭。 */
export function tabsKeyIntent(
  key: string,
  activeIndex: number,
  count: number,
  canClose: boolean,
): TabsKeyIntent | null {
  if (count === 0) return null;
  const current = activeIndex >= 0 ? activeIndex : 0;
  switch (key) {
    case "ArrowRight":
      return { type: "activate", index: (current + 1) % count };
    case "ArrowLeft":
      return { type: "activate", index: (current - 1 + count) % count };
    case "Home":
      return { type: "activate", index: 0 };
    case "End":
      return { type: "activate", index: count - 1 };
    case "Delete":
      if (canClose && activeIndex >= 0) return { type: "close", index: activeIndex };
      return null;
    default:
      return null;
  }
}

/** 关闭后焦点落到相邻 tab（关闭由上层完成后再聚焦）。 */
export function closeFocusIndex(closedIndex: number, countBeforeClose: number): number {
  return Math.min(closedIndex, countBeforeClose - 2);
}
