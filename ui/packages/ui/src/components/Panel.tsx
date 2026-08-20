/**
 * YoPanel —— 画布上的卡片/分区唯一容器。
 * HarmonyOS：surface + radius-md + hairline 描边 + XS 阴影。card / pane 同一套铬，禁止模块再手写卡片。
 * pane：撑满剩余空间，内部裁切；阴影画在外壳，不被 overflow 吃掉。
 */
import type { JSX } from "solid-js";
import { Show } from "solid-js";
import "./Panel.css";

/** 内边距取值（映射到间距 token） */
export type YoPanelPadding = "none" | "xs" | "sm" | "md" | "lg" | "xl";

/** card = 内容卡片（hug）；pane = 撑满的模块分区。铬相同。 */
export type YoPanelVariant = "card" | "pane";

export interface YoPanelProps {
  /** 面板标题 */
  title?: string;
  /** 标题行右侧操作（清屏、关闭等） */
  actions?: JSX.Element;
  /** 自定义顶栏（路径栏等）；出现时替代 title/actions */
  header?: JSX.Element;
  /** 内边距；card 默认 md，pane 默认 none */
  padding?: YoPanelPadding;
  /** 默认 card */
  variant?: YoPanelVariant;
  class?: string;
  classList?: Record<string, boolean | undefined>;
  "aria-label"?: string;
  children: JSX.Element;
}

/**
 * 渲染圆角卡片分区。模块分区一律走本组件，不要再铺 surface + radius-md。
 */
export function YoPanel(props: YoPanelProps): JSX.Element {
  const padding = () => props.padding ?? (props.variant === "pane" ? "none" : "md");
  const pane = () => props.variant === "pane";

  return (
    <section
      class={`yohu-panel${props.class ? ` ${props.class}` : ""}`}
      classList={{
        "yohu-panel--pane": pane(),
        [`yohu-panel--padding-${padding()}`]: true,
        ...props.classList,
      }}
      aria-label={props["aria-label"]}
    >
      <div class="yohu-panel__clip">
        <Show when={props.header}>
          <div class="yohu-panel__header yohu-panel__header--custom">{props.header}</div>
        </Show>
        <Show when={!props.header && pane() && (props.title || props.actions)}>
          <header class="yohu-panel__header">
            <Show when={props.title}>
              <h3 class="yohu-panel__heading">{props.title}</h3>
            </Show>
            <Show when={props.actions}>
              <div class="yohu-panel__actions">{props.actions}</div>
            </Show>
          </header>
        </Show>
        <Show when={!props.header && !pane() && props.title}>
          <h3 class="yohu-panel__title">{props.title}</h3>
        </Show>
        <div class="yohu-panel__body">{props.children}</div>
      </div>
    </section>
  );
}
