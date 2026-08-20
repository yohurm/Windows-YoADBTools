/**
 * 模块页眉：右侧内容区顶部的标题区 + 功能栏（不进窗口标题栏）。
 * 标题行高度走 --yohu-control-height，有无操作同一占位，避免投屏/设置标题上移。
 */
import { Show, type JSX } from "solid-js";
import "./chrome.css";

export interface YoChromeProps {
  /** 模块功能标题 */
  title: string;
  /** 标题旁附加（设备徽章等） */
  leading?: JSX.Element;
  /** 功能栏操作（按钮/检索等） */
  children?: JSX.Element;
}

/**
 * 渲染模块页眉：左侧标题区，右侧功能栏。无操作时只显示标题。
 */
export function YoChrome(props: YoChromeProps): JSX.Element {
  return (
    <header class="yohu-chrome">
      <div class="yohu-chrome__title">
        <span class="yohu-module-title">{props.title}</span>
        {props.leading}
      </div>
      <Show when={props.children}>
        <div class="yohu-chrome__bar">{props.children}</div>
      </Show>
    </header>
  );
}
