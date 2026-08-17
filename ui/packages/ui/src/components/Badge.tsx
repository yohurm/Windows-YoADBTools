/**
 * YBadge —— 小圆角胶囊徽章。
 * tone: neutral / accent / success / warn / error。
 */
import type { JSX } from "solid-js";
import "./Badge.css";

export type YBadgeTone = "neutral" | "accent" | "success" | "warn" | "error";

export interface YBadgeProps {
  /** 徽章文本 */
  text: string;
  /** 语义色调 */
  tone?: YBadgeTone;
}

/**
 * 渲染一个胶囊徽章。
 */
export function YBadge(props: YBadgeProps): JSX.Element {
  return (
    <span
      class="yovo-badge"
      classList={{ [`yovo-badge--${props.tone ?? "neutral"}`]: true }}
      aria-label={props.text}
    >
      {props.text}
    </span>
  );
}
