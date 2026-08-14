/**
 * YStatusBar —— 底部状态栏。
 * 左/右两个插槽；NavBg 底、上边框。
 */
import type { JSX } from "solid-js";
import "./StatusBar.css";

export interface YStatusBarProps {
  /** 左侧插槽 */
  left?: JSX.Element;
  /** 右侧插槽 */
  right?: JSX.Element;
}

/**
 * 渲染一个左右布局的底部状态栏。
 */
export function YStatusBar(props: YStatusBarProps): JSX.Element {
  return (
    <footer class="yovo-status-bar">
      <div class="yovo-status-bar__left">{props.left}</div>
      <div class="yovo-status-bar__right">{props.right}</div>
    </footer>
  );
}
