/**
 * YoStatusBar —— 窗口底部状态栏。
 * HarmonyOS 对照：应用状态栏；透明贴合 canvas，上边框分割。
 * 受控 API：left / right。
 */
import type { JSX } from "solid-js";
import "./StatusBar.css";

export interface YoStatusBarProps {
  /** 左侧插槽 */
  left?: JSX.Element;
  /** 右侧插槽 */
  right?: JSX.Element;
}

/**
 * 渲染一个左右布局的底部状态栏。
 */
export function YoStatusBar(props: YoStatusBarProps): JSX.Element {
  return (
    <footer class="yohu-status-bar">
      <div class="yohu-status-bar__left">{props.left}</div>
      <div class="yohu-status-bar__right">{props.right}</div>
    </footer>
  );
}
