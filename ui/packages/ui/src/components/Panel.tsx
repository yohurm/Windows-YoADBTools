/**
 * YoPanel —— 面板/卡片容器。
 * HarmonyOS 对照：卡片；surface 底 + 边框 + Radius.Md（深浅均非纯白铺满）。
 * 受控 API：title / padding / children。
 */
import type { JSX } from "solid-js";
import "./Panel.css";

/** 内边距取值（映射到间距 token） */
export type YoPanelPadding = "none" | "xs" | "sm" | "md" | "lg" | "xl";

export interface YoPanelProps {
  /** 面板标题 */
  title?: string;
  /** 内边距，默认 md */
  padding?: YoPanelPadding;
  children: JSX.Element;
}

/**
 * 渲染一个带边框圆角的面板容器。
 */
export function YoPanel(props: YoPanelProps): JSX.Element {
  return (
    <section class="yohu-panel" classList={{ [`yohu-panel--padding-${props.padding ?? "md"}`]: true }}>
      {props.title ? <h3 class="yohu-panel__title">{props.title}</h3> : null}
      <div class="yohu-panel__body">{props.children}</div>
    </section>
  );
}
