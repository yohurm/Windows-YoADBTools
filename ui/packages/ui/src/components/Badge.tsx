/**
 * YoBadge —— 状态胶囊徽章。
 * HarmonyOS 对照：Chip / Badge；tone 走语义色。
 * 受控 API：text / tone。
 */
import type { JSX } from "solid-js";
import "./Badge.css";

export type YoBadgeTone = "neutral" | "accent" | "success" | "warn" | "error";

export interface YoBadgeProps {
  /** 徽章文本 */
  text: string;
  /** 语义色调 */
  tone?: YoBadgeTone;
}

/**
 * 渲染一个胶囊徽章。
 */
export function YoBadge(props: YoBadgeProps): JSX.Element {
  return (
    <span
      class="yohu-badge"
      classList={{ [`yohu-badge--${props.tone ?? "neutral"}`]: true }}
      aria-label={props.text}
    >
      {props.text}
    </span>
  );
}
