/**
 * YoIconButton —— 图标按钮。
 * 透明底，hover / pressed 走 --yohu-state-*；通过 title 提供悬浮提示。
 */
import type { JSX } from "solid-js";
import { Icon, type IconName } from "../icons";
import "./IconButton.css";

export interface YoIconButtonProps {
  /** 图标名 */
  icon: IconName;
  /** 悬浮提示（同时作为 aria-label） */
  title?: string;
  /** 禁用 */
  disabled?: boolean;
  /** 加载中：图标按 `--yohu-dur-loop` 旋转（UI设计系统 §2.4） */
  loading?: boolean;
  /** 图标尺寸（px） */
  size?: number;
  /** 点击回调 */
  onClick?: (event: MouseEvent) => void;
}

/**
 * 渲染一个透明底的图标按钮。
 */
export function YoIconButton(props: YoIconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      class="yohu-icon-button yohu-focus-ring"
      classList={{ "yohu-icon-button--loading": !!props.loading }}
      title={props.title}
      aria-label={props.title}
      aria-busy={props.loading}
      disabled={props.disabled || props.loading}
      onClick={props.onClick}
    >
      <Icon name={props.icon} size={props.size} />
    </button>
  );
}
