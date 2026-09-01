/**
 * YoCollapse —— 高度 0fr/1fr 过渡（动画系统-v6.md 配方 collapse / panel）。
 * 子树保持挂载以便插值；关闭时 aria-hidden + inert。
 * panel：Fluent 双轨（高度空间 + 内容淡入上移），供传输列表等面板级折叠。
 */
import type { JSX } from "solid-js";
import type { CollapseRecipe } from "./recipes";

export type { CollapseRecipe };

export interface YoCollapseProps {
  open: boolean;
  /** 默认 collapse（仅高度）。panel = 高度 + 内容淡入上移。 */
  recipe?: CollapseRecipe;
  children: JSX.Element;
}

export function YoCollapse(props: YoCollapseProps): JSX.Element {
  return (
    <div
      class="yohu-collapse"
      data-open={props.open ? "true" : "false"}
      data-recipe={props.recipe ?? "collapse"}
    >
      <div class="yohu-collapse__inner" aria-hidden={!props.open || undefined} inert={!props.open ? true : undefined}>
        {props.children}
      </div>
    </div>
  );
}
