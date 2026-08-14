/**
 * YPanel —— 面板容器。
 * 白底、1px PanelBorder 边框、Radius.Md 圆角；可选标题与内边距（默认 md）。
 */
import type { JSX } from "solid-js";
import "./Panel.css";

/** 内边距取值（映射到间距 token） */
export type YPanelPadding = "none" | "xs" | "sm" | "md" | "lg" | "xl";

export interface YPanelProps {
  /** 面板标题 */
  title?: string;
  /** 内边距，默认 md */
  padding?: YPanelPadding;
  children: JSX.Element;
}

/**
 * 渲染一个带边框圆角的面板容器。
 */
export function YPanel(props: YPanelProps): JSX.Element {
  return (
    <section class="yovo-panel" classList={{ [`yovo-panel--padding-${props.padding ?? "md"}`]: true }}>
      {props.title ? <h3 class="yovo-panel__title">{props.title}</h3> : null}
      <div class="yovo-panel__body">{props.children}</div>
    </section>
  );
}
