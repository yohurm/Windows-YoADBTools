/**
 * YoButton —— 通用按钮。
 * HarmonyOS 对照：Button；最大宽 448vp；primary = brand + font_on。
 * 受控 API：variant / size / loading / disabled / onClick / type / children。
 */
import type { JSX } from "solid-js";
import "./Button.css";

export type YoButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type YoButtonSize = "sm" | "md";

export interface YoButtonProps {
  /** 语义变体 */
  variant?: YoButtonVariant;
  /** 尺寸 */
  size?: YoButtonSize;
  /** 加载态（显示 spinner 并禁用） */
  loading?: boolean;
  /** 禁用 */
  disabled?: boolean;
  /** 点击回调 */
  onClick?: (event: MouseEvent) => void;
  /** 原生按钮类型 */
  type?: "button" | "submit" | "reset";
  /** 展开控件（预览栏等） */
  "aria-expanded"?: boolean;
  children: JSX.Element;
}

/**
 * 渲染一个带语义变体与尺寸的按钮。
 */
export function YoButton(props: YoButtonProps): JSX.Element {
  return (
    <button
      type={props.type ?? "button"}
      class="yohu-button yohu-focus-ring"
      classList={{
        [`yohu-button--${props.variant ?? "primary"}`]: true,
        [`yohu-button--${props.size ?? "md"}`]: true,
      }}
      disabled={props.disabled || props.loading}
      aria-busy={props.loading}
      aria-expanded={props["aria-expanded"]}
      onClick={props.onClick}
    >
      {props.loading ? <span class="yohu-button__spinner" aria-hidden="true" /> : null}
      {props.children}
    </button>
  );
}
