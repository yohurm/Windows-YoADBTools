/**
 * YoEmptyState —— 空状态占位。
 * 居中灰字，可选图标与描述。
 */
import type { JSX } from "solid-js";
import { Icon, type IconName } from "../icons";
import "./EmptyState.css";

export interface YoEmptyStateProps {
  /** 图标名 */
  icon?: IconName;
  /** 标题 */
  title: string;
  /** 描述 */
  description?: string;
}

/**
 * 渲染一个居中的空状态占位。
 */
export function YoEmptyState(props: YoEmptyStateProps): JSX.Element {
  return (
    <div class="yohu-empty-state">
      {props.icon ? <Icon name={props.icon} size={40} /> : null}
      <div class="yohu-empty-state__title">{props.title}</div>
      {props.description ? <div class="yohu-empty-state__description">{props.description}</div> : null}
    </div>
  );
}
