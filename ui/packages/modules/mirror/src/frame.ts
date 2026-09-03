/**
 * 投屏铬层 CSS 变量（纯函数，无 DOM）。
 *
 * HWND 几何由壳按可用区 insets contain；这里只驱动透明占位的 hug。
 */

import { containInZone, MIN_LAYOUT_PX } from "./layout";

export function frameStyle(zoneW: number, zoneH: number, width: number, height: number, phase: string): string {
  if (phase !== "live" || !(width > 0 && height > 0)) return "";
  if (zoneW < MIN_LAYOUT_PX || zoneH < MIN_LAYOUT_PX) return "";
  const box = containInZone({ left: 0, top: 0, width: zoneW, height: zoneH }, width, height);
  if (box.width === zoneW && box.height === zoneH) return "";
  return `--mirror-w:${box.width}px; --mirror-h:${box.height}px;`;
}
