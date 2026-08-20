/**
 * YoCollapse —— 高度 0fr/1fr 过渡（动画系统-v6.md 配方 collapse）。
 * 子树保持挂载以便插值；关闭时 aria-hidden + inert。
 */
import type { JSX } from "solid-js";

export interface YoCollapseProps {
  open: boolean;
  children: JSX.Element;
}

export function YoCollapse(props: YoCollapseProps): JSX.Element {
  return (
    <div class="yohu-collapse" data-open={props.open ? "true" : "false"}>
      <div class="yohu-collapse__inner" aria-hidden={!props.open || undefined} inert={!props.open ? true : undefined}>
        {props.children}
      </div>
    </div>
  );
}
