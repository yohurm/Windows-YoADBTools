/** 可用区几何：View 量 `.yohu-mirror__avail` 后经 `clientZoneRect` 上报；contain 只作壳公式对照。 */

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

/** 客户区 insets 键：窗口缩放时不变。 */
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
 * 与壳 `contain_in_zone` 同公式，供单测对照。View 运行时不调用。
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

/** `getComputedStyle` 的 rgb()/rgba()/#rrggbb → 0xAARRGGBB。无法解析则 0。 */
export function cssColorToArgb(css: string): number {
  const value = css.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  const hexDigits = hex?.[1];
  if (hexDigits) {
    return (0xff000000 | Number.parseInt(hexDigits, 16)) >>> 0;
  }
  const comma = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(
    value,
  );
  const space = /^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i.exec(value);
  const m = comma ?? space;
  if (!m) return 0;
  const r = Math.round(Number(m[1])) & 255;
  const g = Math.round(Number(m[2])) & 255;
  const b = Math.round(Number(m[3])) & 255;
  let a = 255;
  if (m[4] !== undefined) {
    const raw = m[4];
    const n = raw.endsWith("%") ? Number.parseFloat(raw) / 100 : Number(raw);
    a = Math.round((n <= 1 ? n : n / 255) * 255) & 255;
  }
  return ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
}

export function tokenArgb(el: HTMLElement, token: string): number {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  el.appendChild(probe);
  const argb = cssColorToArgb(getComputedStyle(probe).color);
  probe.remove();
  return argb;
}

export function physicalFontPx(cssPx: number, devicePixelRatio: number): number {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.max(1, Math.round(cssPx * dpr));
}
