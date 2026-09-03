/** 可用区几何：铬层 CSS 用 contain；HWND 由壳按客户区 insets contain。 */

import { fitContain } from "./fit";

/** 与壳 `MIN_LAYOUT_PX` 一致：低于此值的盒不能 Present，也不该上报。 */
export const MIN_LAYOUT_PX = 64;

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

/** 客户区 insets 键：窗口缩放时不变，只有铬层变才该重报 `mirror.layout`。 */
export function zoneInsetKey(
  zone: PhysicalRect,
  clientW: number,
  clientH: number,
  visible: boolean,
  radius: number,
): string {
  const right = clientW - zone.x - zone.width;
  const bottom = clientH - zone.y - zone.height;
  return `${zone.x},${zone.y},${right},${bottom},v=${visible},r=${radius}`;
}

export function layoutIsPresentable(width: number, height: number): boolean {
  return width >= MIN_LAYOUT_PX && height >= MIN_LAYOUT_PX;
}

/**
 * 在可用区内按画面宽高比 contain，并居中。
 * 只驱动铬层 CSS。HWND contain 在壳内按同一公式算。
 */
export function containInZone(zone: CssRect, videoW: number, videoH: number): CssRect {
  if (!(videoW > 0 && videoH > 0)) return zone;
  if (zone.width < MIN_LAYOUT_PX || zone.height < MIN_LAYOUT_PX) return zone;
  const box = fitContain(zone.width, zone.height, videoW / videoH);
  if (box.w < MIN_LAYOUT_PX || box.h < MIN_LAYOUT_PX) return zone;
  return {
    left: zone.left + (zone.width - box.w) / 2,
    top: zone.top + (zone.height - box.h) / 2,
    width: box.w,
    height: box.h,
  };
}

/** CSS 圆角 → 物理像素半径（DirectComposition clip）。 */
export function physicalCornerRadius(cssRadiusPx: number, devicePixelRatio: number): number {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  if (!(cssRadiusPx > 0)) return 0;
  return Math.max(0, Math.round(cssRadiusPx * dpr));
}
