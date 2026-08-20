/**
 * 右键菜单落点：按视口夹紧，避免贴边时整块溢出。
 * 高度按条目估算（与 YoContextMenu 行高 control-height 对齐），禁止传 0。
 */

import { Density } from "../tokens/density";
import { Layout } from "../tokens/layout";
import { Spacing } from "../tokens/spacing";

export function estimateContextMenuHeight(itemCount: number): number {
  const rows = Math.max(1, itemCount);
  return Spacing.Xs * 2 + rows * Density.Comfortable.controlHeight;
}

export function clampContextMenuPoint(
  x: number,
  y: number,
  itemCount: number,
  viewport: { width: number; height: number },
): { x: number; y: number } {
  const width = Layout.MenuMin;
  const height = estimateContextMenuHeight(itemCount);
  return {
    x: Math.min(Math.max(0, x), Math.max(0, viewport.width - width)),
    y: Math.min(Math.max(0, y), Math.max(0, viewport.height - height)),
  };
}
