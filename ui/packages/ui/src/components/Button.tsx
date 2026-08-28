/**
 * YoButton —— 通用按钮。
 * HarmonyOS 对照：Button；最大宽 448vp；primary = brand + font_on。
 * 文案切换交给 motion/YoSwap（沿轴裁切展开/收起），本文件只负责铬、变体、加载。
 */
import { Show, children, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { resolveText } from "../dom/text";
import { YoSwap } from "../motion/swap";
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

/** 只对纯文案走 Swap；复合 children 原样渲染。 */
/** 渲染一个带语义变体与尺寸的按钮。 */
export function YoButton(props: YoButtonProps): JSX.Element {
  const resolved = children(() => props.children);
  const text = createMemo(() => resolveText(resolved()));

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
      <Show when={text() !== null} fallback={resolved()}>
        <YoSwap keys={text() as string}>{text()}</YoSwap>
      </Show>
    </button>
  );
}
