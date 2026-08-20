/**
 * YoPanel —— 面板/卡片容器。
 * HarmonyOS 对照：surface 卡片铺在 canvas 上，Radius.Md；分区靠圆角+底色，不描外边框。
 * 受控 API：title / padding / variant / children。
 */
import type { JSX } from "solid-js";
import "./Panel.css";

/** 内边距取值（映射到间距 token） */
export type YoPanelPadding = "none" | "xs" | "sm" | "md" | "lg" | "xl";

/** card = 内容卡片；pane = 撑满的模块分区（同样圆角，无外边框）。 */
export type YoPanelVariant = "card" | "pane";

export interface YoPanelProps {
  /** 面板标题 */
  title?: string;
  /** 内边距；card 默认 md，pane 默认 none */
  padding?: YoPanelPadding;
  /** 默认 card */
  variant?: YoPanelVariant;
  children: JSX.Element;
}

/**
 * 渲染圆角卡片分区（canvas 通铺上的 surface；pane 撑满且裁切内部）。
 */
export function YoPanel(props: YoPanelProps): JSX.Element {
  const padding = () => props.padding ?? (props.variant === "pane" ? "none" : "md");
  return (
    <section
      class="yohu-panel"
      classList={{
        "yohu-panel--pane": props.variant === "pane",
        [`yohu-panel--padding-${padding()}`]: true,
      }}
    >
      {props.title ? <h3 class="yohu-panel__title">{props.title}</h3> : null}
      <div class="yohu-panel__body">{props.children}</div>
    </section>
  );
}
