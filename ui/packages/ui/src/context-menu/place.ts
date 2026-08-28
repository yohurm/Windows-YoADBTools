/**
 * 右键菜单落点：按视口夹紧，避免贴边时整块溢出。
 * 打开时先按条目估算宽高夹紧（`clampContextMenuPoint`）；菜单挂载后应再以
 * **实测** `offsetWidth/offsetHeight` 二次夹紧（`clampToRect`），
 * 因为 `Layout.MenuMin` 只是最小宽，更宽条目会让估算偏小，贴右/下边时会溢出。
 */

import { Density } from "../tokens/density";
import { Layout } from "../tokens/layout";
import { Spacing } from "../tokens/spacing";

export function estimateContextMenuHeight(itemCount: number): number {
  const rows = Math.max(1, itemCount);
  return Spacing.Xs * 2 + rows * Density.Comfortable.controlHeight;
}

/** 按任意（真实）尺寸夹紧到视口内；只向内收，绝不放宽到溢出。 */
export function clampToRect(
  x: number,
  y: number,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { x: number; y: number } {
  const width = Math.max(0, size.width);
  const height = Math.max(0, size.height);
  return {
    x: Math.min(Math.max(0, x), Math.max(0, viewport.width - width)),
    y: Math.min(Math.max(0, y), Math.max(0, viewport.height - height)),
  };
}

export function clampContextMenuPoint(
  x: number,
  y: number,
  itemCount: number,
  viewport: { width: number; height: number },
): { x: number; y: number } {
  return clampToRect(x, y, { width: Layout.MenuMin, height: estimateContextMenuHeight(itemCount) }, viewport);
}
