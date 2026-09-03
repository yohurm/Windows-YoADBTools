/**
 * 投屏面板边界样式（--mirror-w/--mirror-h，纯函数，无 DOM）。
 *
 * 行为定义（自底向上）：
 *  - 空闲/未启动（非 live）→ 返回 ""，面板回退 width/height:100% 撑满内容区；
 *    百分比恒定 → 窗口 resize 即时跟随，不会因转场滞后。
 *  - live 且分辨率与可用区均可测 → 返回按设备宽高比 contain 的贴合 px，
 *    面板边缘贴合设备画面。
 *  - 其余 → ""。
 *
 * 铬层宽高可 spatialPanel 过渡；HWND 跟盒，不在 CSS 里缩放视频。
 */

import { fitContain } from "./fit";

export function frameStyle(zoneW: number, zoneH: number, width: number, height: number, phase: string): string {
  if (phase !== "live") return "";
  if (!(width > 0 && height > 0)) return "";
  if (zoneW < 1 || zoneH < 1) return "";
  const box = fitContain(zoneW, zoneH, width / height);
  return `--mirror-w:${box.w}px; --mirror-h:${box.h}px;`;
}
