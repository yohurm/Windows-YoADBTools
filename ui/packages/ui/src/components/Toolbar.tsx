/**
 * YoToolbar —— 模块工具栏。
 * 水平排列 children，间距 gap 8（Spacing.Sm），底部 margin 12（Spacing.Md）。
 */
import type { JSX } from "solid-js";
import "./Toolbar.css";

export interface YoToolbarProps {
  children: JSX.Element;
}

/**
 * 渲染一个水平排列、间距 8、底部边距 12 的工具栏容器。
 */
export function YoToolbar(props: YoToolbarProps): JSX.Element {
  return <div class="yovo-toolbar">{props.children}</div>;
}
