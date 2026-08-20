/**
 * YoTitleBar —— HarmonyOS 电脑窗口容器层（自定义标题栏）。
 * HarmonyOS 对照：窗口框架容器层；Default 56vp / Compact 40vp；PC 去掉圆形底板。
 * 受控 API：title / icon / children / actions / maximized / onMinimize / onToggleMaximize / onClose。
 *
 * 三键从左到右：最大化（或还原）、最小化、关闭。拖动走 data-tauri-drag-region；按钮 no-drag。
 * 沉浸：背板 = --yohu-canvas；底 1px 分割线。窗口操作由 Application 壳接线，本组件只收回调。
 */
import { Show, type JSX } from "solid-js";
import { Icon, type IconName } from "../icons";
import "./TitleBar.css";

export interface YoTitleBarProps {
  /** 窗口名称 */
  title: string;
  /** 应用图标 */
  icon?: IconName;
  /** 中间区（工具栏 / 分段按钮，电脑普通标题栏） */
  children?: JSX.Element;
  /** 三键左侧操作（最多 3 个图标） */
  actions?: JSX.Element;
  /** 是否最大化（切换还原图标） */
  maximized?: boolean;
  /** 最小化 */
  onMinimize?: () => void;
  /** 最大化 / 还原 */
  onToggleMaximize?: () => void;
  /** 关闭 */
  onClose?: () => void;
}

function isCaptionTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button, a, input") !== null;
}

/**
 * 渲染 HarmonyOS 风格窗口标题栏（无系统边框时由 Application 接线拖动/三键）。
 */
export function YoTitleBar(props: YoTitleBarProps): JSX.Element {
  return (
    <header
      class="yohu-titlebar"
      data-tauri-drag-region
      onDblClick={(event) => {
        if (isCaptionTarget(event.target)) return;
        props.onToggleMaximize?.();
      }}
    >
      <div class="yohu-titlebar__brand" data-tauri-drag-region>
        <Show when={props.icon}>
          {(name) => (
            <span class="yohu-titlebar__icon" aria-hidden="true">
              <Icon name={name()} size={16} />
            </span>
          )}
        </Show>
        <span class="yohu-titlebar__title">{props.title}</span>
      </div>
      <div class="yohu-titlebar__center">{props.children}</div>
      <div class="yohu-titlebar__trailing">
        <Show when={props.actions}>
          <div class="yohu-titlebar__actions">{props.actions}</div>
        </Show>
        <div class="yohu-titlebar__captions">
          <button
            type="button"
            class="yohu-titlebar__caption"
            aria-label={props.maximized ? "还原" : "最大化"}
            title={props.maximized ? "还原" : "最大化"}
            onClick={() => props.onToggleMaximize?.()}
          >
            <Icon name={props.maximized ? "window-restore" : "window-max"} size={12} />
          </button>
          <button
            type="button"
            class="yohu-titlebar__caption"
            aria-label="最小化"
            title="最小化"
            onClick={() => props.onMinimize?.()}
          >
            <Icon name="window-min" size={12} />
          </button>
          <button
            type="button"
            class="yohu-titlebar__caption yohu-titlebar__caption--close"
            aria-label="关闭"
            title="关闭"
            onClick={() => props.onClose?.()}
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      </div>
    </header>
  );
}
