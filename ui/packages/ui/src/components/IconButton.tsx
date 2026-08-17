/**
 * YIconButton —— 图标按钮。
 * 透明底，hover 显示 NavHover；通过 title 提供悬浮提示。
 */
import type { JSX } from "solid-js";
import { Icon, type IconName } from "../icons";
import "./IconButton.css";

export interface YIconButtonProps {
  /** 图标名 */
  icon: IconName;
  /** 悬浮提示（同时作为 aria-label） */
  title?: string;
  /** 禁用 */
  disabled?: boolean;
  /** 加载中：图标按 `--yovo-dur-loop` 旋转（UI设计系统 §2.4） */
  loading?: boolean;
  /** 图标尺寸（px） */
  size?: number;
  /** 点击回调 */
  onClick?: (event: MouseEvent) => void;
}

/**
 * 渲染一个透明底的图标按钮。
 */
export function YIconButton(props: YIconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      class="yovo-icon-button"
      classList={{ "yovo-icon-button--loading": !!props.loading }}
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
