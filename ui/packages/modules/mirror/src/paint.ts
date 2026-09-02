/** display × DPR 位图几何。 */

export function backingStoreSize(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
): { width: number; height: number } {
  const scale = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return {
    width: Math.max(1, Math.round(Math.max(0, cssWidth) * scale)),
    height: Math.max(1, Math.round(Math.max(0, cssHeight) * scale)),
  };
}

/** 整数倍放大用 NEAREST；缩小或非整数用线性/双三次。 */
export function nearestNeighborScale(
  cssWidth: number,
  cssHeight: number,
  videoWidth: number,
  videoHeight: number,
): boolean {
  if (videoWidth < 1 || videoHeight < 1 || cssWidth < 1 || cssHeight < 1) return false;
  const sx = cssWidth / videoWidth;
  const sy = cssHeight / videoHeight;
  if (sx < 1 - 1e-6 || sy < 1 - 1e-6) return false;
  const ix = Math.round(sx);
  const iy = Math.round(sy);
  return ix === iy && ix >= 1 && Math.abs(sx - ix) < 1e-3 && Math.abs(sy - iy) < 1e-3;
}

export function isDownscale(
  cssWidth: number,
  cssHeight: number,
  videoWidth: number,
  videoHeight: number,
): boolean {
  if (videoWidth < 1 || videoHeight < 1) return false;
  return cssWidth / videoWidth < 1 || cssHeight / videoHeight < 1;
}

export function syncBackingStore(canvas: HTMLCanvasElement, dpr: number): boolean {
  const next = backingStoreSize(canvas.clientWidth, canvas.clientHeight, dpr);
  const changed = canvas.width !== next.width || canvas.height !== next.height;
  if (changed) {
    canvas.width = next.width;
    canvas.height = next.height;
  }
  return changed;
}
