/**
 * YButton —— 通用按钮。
 * variants: primary / secondary / ghost / danger；size: sm / md。
 * primary 使用强调色底 + 白字，hover 加深（AccentHover）。
 */
import type { JSX } from "solid-js";
import "./Button.css";

export type YButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type YButtonSize = "sm" | "md";

export interface YButtonProps {
  /** 语义变体 */
  variant?: YButtonVariant;
  /** 尺寸 */
  size?: YButtonSize;
  /** 加载态（显示 spinner 并禁用） */
  loading?: boolean;
  /** 禁用 */
  disabled?: boolean;
  /** 点击回调 */
  onClick?: (event: MouseEvent) => void;
  /** 原生按钮类型 */
  type?: "button" | "submit" | "reset";
  children: JSX.Element;
}

/**
 * 渲染一个带语义变体与尺寸的按钮。
 */
export function YButton(props: YButtonProps): JSX.Element {
  return (
    <button
      type={props.type ?? "button"}
      class="yovo-button"
      classList={{
        [`yovo-button--${props.variant ?? "primary"}`]: true,
        [`yovo-button--${props.size ?? "md"}`]: true,
      }}
      disabled={props.disabled || props.loading}
      aria-busy={props.loading}
      onClick={props.onClick}
    >
      {props.loading ? <span class="yovo-button__spinner" aria-hidden="true" /> : null}
      {props.children}
    </button>
  );
}
