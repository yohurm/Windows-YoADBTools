/**
 * 投屏面板贴合几何（纯函数，无 DOM）。
 *
 * 面板为贴合设备画面边缘（contain）或撑满内容区（空闲/未启动），
 * 输出 inline 自定义属性（--mirror-w/--mirror-h），由 mirror.css 消费。
 */

import { fitContain } from "./fit";

/** 是否处于 Live（有画面贴合等比）模式。 */
export function isFrameMode(phase: string): boolean {
  return phase === "live";
}

/**
 * 计算面板 inline 样式（--mirror-w/--mirror-h，单位 px）。
 *  - zoneW/zoneH 非法（<1）→ 返回 ""（回退 100%）；
 *  - Live 且分辨率已知 → 按设备宽高比 contain 贴合；
 *  - 否则（空闲/未启动/失败）→ 撑满内容区。
 */
export function frameStyle(zoneW: number, zoneH: number, width: number, height: number, phase: string): string {
  if (zoneW < 1 || zoneH < 1) return "";
  if (phase === "live" && width > 0 && height > 0) {
    const box = fitContain(zoneW, zoneH, width / height);
    return `--mirror-w:${box.w}px; --mirror-h:${box.h}px;`;
  }
  return `--mirror-w:${zoneW}px; --mirror-h:${zoneH}px;`;
}
