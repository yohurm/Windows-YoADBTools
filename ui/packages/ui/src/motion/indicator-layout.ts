/**
 * 选中指示器几何：目标盒相对 track 内容坐标（含滚动）。
 * 位移走弹簧；宽高走软弹簧滞后（拉伸回弹）。
 */
import type { MotionDurationName } from "../tokens/motion";
import { Spacing } from "../tokens/spacing";

export type IndicatorVariant = "fill" | "underline" | "thumb";

export interface IndicatorBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const EMPTY_INDICATOR: IndicatorBox = { x: 0, y: 0, width: 0, height: 0 };

export function measureIndicator(
  track: DOMRectReadOnly,
  item: DOMRectReadOnly,
  scroll: { left: number; top: number } = { left: 0, top: 0 },
): IndicatorBox {
  return {
    x: item.left - track.left + scroll.left,
    y: item.top - track.top + scroll.top,
    width: Math.max(0, item.width),
    height: Math.max(0, item.height),
  };
}

export function indicatorReady(box: IndicatorBox): boolean {
  return box.width > 0 && box.height > 0;
}

/** 行程定时长：短跳 fast、邻项 small、跨栏 local。 */
export function indicatorDurationName(from: IndicatorBox, to: IndicatorBox): MotionDurationName {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  if (dist < Spacing.TwoXl) {
    return "fast";
  }
  if (dist < Spacing.TwoXl * 4) {
    return "small";
  }
  return "local";
}
