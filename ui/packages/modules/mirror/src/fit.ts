/**
 * 投屏面板贴合几何（纯函数，无 DOM）。
 *
 * 目的：设备画面出帧后，画面显示面板边缘自适应投屏画面边缘 ——
 * 面板按画面宽高比等比缩放（contain）到可用区域内，四周不留空边。
 * 空闲/未启动时不调用本函数（面板回退为撑满内容区）。
 */

export interface PanelBox {
  w: number;
  h: number;
}

/**
 * 在可用尺寸 availW×availH 内，按 aspect（宽/高）等比 contain 出贴合框。
 * 返回 { w, h }；任何非法输入返回 { w: 0, h: 0 }。
 */
export function fitContain(availW: number, availH: number, aspect: number): PanelBox {
  if (!Number.isFinite(availW) || !Number.isFinite(availH) || availW <= 0 || availH <= 0) {
    return { w: 0, h: 0 };
  }
  if (!Number.isFinite(aspect) || aspect <= 0) {
    return { w: 0, h: 0 };
  }
  const width = Math.min(availW, availH * aspect);
  const height = width / aspect;
  return { w: Math.round(width), h: Math.round(height) };
}
