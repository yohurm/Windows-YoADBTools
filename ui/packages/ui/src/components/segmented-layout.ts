/**
 * 选择块几何：按真实 item 盒相对 track 测距（ArkUI 均分宽，但跟手块必须贴合实测盒）。
 */

export interface ThumbBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const EMPTY_THUMB: ThumbBox = { x: 0, y: 0, width: 0, height: 0 };

export function measureThumb(track: DOMRectReadOnly, item: DOMRectReadOnly): ThumbBox {
  return {
    x: item.left - track.left,
    y: item.top - track.top,
    width: Math.max(0, item.width),
    height: Math.max(0, item.height),
  };
}

export function thumbReady(box: ThumbBox): boolean {
  return box.width > 0 && box.height > 0;
}
