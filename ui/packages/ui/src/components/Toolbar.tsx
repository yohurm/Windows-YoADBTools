/**
 * YoToolbar —— 模块工具栏。
 * HarmonyOS 对照：标题栏中区 / Toolbar；水平排列，间距 Spacing.Sm。
 * 受控 API：children。
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
  return <div class="yohu-toolbar">{props.children}</div>;
}
