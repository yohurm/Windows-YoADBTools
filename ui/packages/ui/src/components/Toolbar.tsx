/**
 * YoToolbar —— 页内/对话框工具栏。
 * 模块页眉请用 YoChrome（标题区 + 功能栏），不要把操作挤进窗口标题栏。
 */
import type { JSX } from "solid-js";
import "./Toolbar.css";

export interface YoToolbarProps {
  children: JSX.Element;
}

/**
 * 渲染一个水平排列、间距 8 的工具栏容器。
 */
export function YoToolbar(props: YoToolbarProps): JSX.Element {
  return <div class="yohu-toolbar">{props.children}</div>;
}
