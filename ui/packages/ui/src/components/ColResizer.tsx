/**
 * YoColResizer —— 表头列宽拖拽（资源管理器式）。
 * 按下后 pointer capture，把水平位移交给调用方累加到列宽。
 */
import type { JSX } from "solid-js";
import "./ColResizer.css";

export interface YoColResizerProps {
  /** 列宽增量（px，可负） */
  onResize: (deltaX: number) => void;
  /** 无障碍名称 */
  label?: string;
}

/**
 * 渲染一个位于列右缘的拖拽条。
 */
export function YoColResizer(props: YoColResizerProps): JSX.Element {
  let originX = 0;

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    originX = event.clientX;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId))) return;
    const x = event.clientX;
    if (!Number.isFinite(x)) return;
    const dx = x - originX;
    if (dx === 0) return;
    originX = event.clientX;
    props.onResize(dx);
  };

  return (
    <button
      type="button"
      class="yohu-col-resizer"
      aria-label={props.label ?? "调节列宽"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    />
  );
}
