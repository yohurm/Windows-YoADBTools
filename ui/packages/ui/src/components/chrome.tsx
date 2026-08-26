/**
 * 模块页眉：右侧内容区顶部的标题区 + 功能栏（不进窗口标题栏）。
 * 主行高度走 --yohu-control-height；次行 `extra` 给质量/过滤等，避免挤进主行把顶栏撑乱。
 */
import { Show, type JSX } from "solid-js";
import { YoBadge } from "./Badge";
import "./chrome.css";

export interface YoChromeProps {
  /** 模块功能标题 */
  title: string;
  /** 选中设备展示名（标题后中性徽章；无选中不传） */
  deviceLabel?: string;
  /** 标题旁附加（设备徽章以外的补充） */
  leading?: JSX.Element;
  /** 主行功能栏（≤6 个操作；HarmonyOS C 栏上限） */
  children?: JSX.Element;
  /** 次行（质量/开关/导航键）；可折行，不进主行 */
  extra?: JSX.Element;
  /** 文件拖入命中忽略（页眉不当投放目标） */
  dropIgnore?: boolean;
}

/**
 * 渲染模块页眉：主行左侧标题区、右侧功能栏；可选次行。无操作时只显示标题区。
 */
export function YoChrome(props: YoChromeProps): JSX.Element {
  return (
    <header class="yohu-chrome" data-drop={props.dropIgnore ? "ignore" : undefined}>
      <div class="yohu-chrome__row">
        <div class="yohu-chrome__title">
          <span class="yohu-module-title">{props.title}</span>
          <Show when={props.deviceLabel}>
            {(label) => (
              <span class="yohu-chrome__device">
                <YoBadge text={label()} tone="neutral" />
              </span>
            )}
          </Show>
          {props.leading}
        </div>
        <Show when={props.children}>
          <div class="yohu-chrome__bar">{props.children}</div>
        </Show>
      </div>
      <Show when={props.extra}>
        <div class="yohu-chrome__extra">{props.extra}</div>
      </Show>
    </header>
  );
}
