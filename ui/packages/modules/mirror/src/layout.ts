/** 面板 CSS 盒 → 屏幕物理像素矩形（`mirror.layout`）。 */

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

/** `getBoundingClientRect` + 窗口屏幕原点 + visualViewport 偏移 + DPR。一律物理像素。 */
export function physicalPanelRect(
  css: CssRect,
  screenX: number,
  screenY: number,
  devicePixelRatio: number,
  viewportOffset: ViewportOffset = { left: 0, top: 0 },
): PhysicalRect {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const left = css.left + (Number.isFinite(viewportOffset.left) ? viewportOffset.left : 0);
  const top = css.top + (Number.isFinite(viewportOffset.top) ? viewportOffset.top : 0);
  return {
    x: Math.round((screenX + left) * dpr),
    y: Math.round((screenY + top) * dpr),
    width: Math.max(1, Math.round(css.width * dpr)),
    height: Math.max(1, Math.round(css.height * dpr)),
  };
}
