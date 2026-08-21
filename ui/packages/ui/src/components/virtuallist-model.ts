/**
 * 定高虚拟列表窗口计算（L2）。视图只接线滚动与渲染。
 */

export const VIRTUAL_STICK_THRESHOLD = 32;

export function virtualTotalHeight(count: number, itemHeight: number): number {
  return count * itemHeight;
}

export function virtualRange(
  scrollTop: number,
  viewportHeight: number,
  itemHeight: number,
  count: number,
  overscan: number,
): { start: number; end: number } {
  if (itemHeight <= 0 || count <= 0) return { start: 0, end: 0 };
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleEnd = Math.ceil((scrollTop + viewportHeight) / itemHeight);
  const end = Math.min(count, visibleEnd + overscan);
  return { start, end };
}

export function isStuckToBottom(
  scrollHeight: number,
  clientHeight: number,
  scrollTop: number,
  threshold = VIRTUAL_STICK_THRESHOLD,
): boolean {
  return scrollHeight - clientHeight - scrollTop <= threshold;
}
