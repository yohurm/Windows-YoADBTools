/**
 * YoColHeader —— 表头列轨道。
 * 轨道铺满列格：悬浮片 inset 0、圆角 none（矩形列，不是列表圆角片）。
 * 排序钮（.yohu-interactive）铺满内容区且 padding 为 0；文案边距只写在 .yohu-col-header__label。
 * 禁止用行 padding 把轨道往里推，也禁止把 content-pad 写在 button 宿主上。
 * 对照：AG Grid ag-header-cell；Spectrum headCell / columnResizer；VS Code sash vs th。
 */
import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { YoColResizer } from "./ColResizer";
import "./ColHeader.css";

export type YoColHeaderAlign = "start" | "end";
export type YoColHeaderSort = "ascending" | "descending" | "none";

export interface YoColHeaderProps {
  /** 内容对齐 */
  align?: YoColHeaderAlign;
  /** 当前列排序态 */
  ariaSort?: YoColHeaderSort;
  /** 是否显示右缘拖拽条 */
  resizable?: boolean;
  /** 拖拽条无障碍名称 */
  resizeLabel?: string;
  /** 列宽增量（px，可负） */
  onResize?: (deltaX: number) => void;
  children: JSX.Element;
}

/**
 * 渲染一列的表头轨道。模块只往内容区塞排序文案，不要在模块 CSS 再画列分割线。
 */
export function YoColHeader(props: YoColHeaderProps): JSX.Element {
  return (
    <div
      class="yohu-col-header"
      classList={{ "yohu-col-header--end": props.align === "end" }}
      role="columnheader"
      aria-sort={props.ariaSort ?? "none"}
    >
      <div class="yohu-col-header__content">{props.children}</div>
      <Show when={props.resizable && props.onResize}>
        <YoColResizer label={props.resizeLabel} onResize={(dx) => props.onResize?.(dx)} />
      </Show>
    </div>
  );
}
