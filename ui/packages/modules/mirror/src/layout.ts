/** 可用区几何：View 量 `.yohu-mirror__avail` 后经 `clientZoneRect` 上报。 */

import { MIRROR_MIN_LAYOUT_PX } from "@yohu/api";

export interface CssRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PhysicalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportOffset {
  left: number;
  top: number;
}

/**
 * 可用区相对 WebView 视口（= 主窗客户区）的物理像素。
 * HWND 是 WS_CHILD，禁止再加 `screenX`。
 */
export function clientZoneRect(
  css: CssRect,
  devicePixelRatio: number,
  viewportOffset: ViewportOffset = { left: 0, top: 0 },
): PhysicalRect {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const left = css.left + (Number.isFinite(viewportOffset.left) ? viewportOffset.left : 0);
  const top = css.top + (Number.isFinite(viewportOffset.top) ? viewportOffset.top : 0);
  return {
    x: Math.round(left * dpr),
    y: Math.round(top * dpr),
    width: Math.max(0, Math.round(css.width * dpr)),
    height: Math.max(0, Math.round(css.height * dpr)),
  };
}

export function layoutIsPresentable(width: number, height: number): boolean {
  return width >= MIRROR_MIN_LAYOUT_PX && height >= MIRROR_MIN_LAYOUT_PX;
}
