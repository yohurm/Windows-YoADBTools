/**
 * YEmptyState —— 空状态占位。
 * 居中灰字，可选图标与描述。
 */
import type { JSX } from "solid-js";
import { Icon, type IconName } from "../icons";
import "./EmptyState.css";

export interface YEmptyStateProps {
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
export function YEmptyState(props: YEmptyStateProps): JSX.Element {
  return (
    <div class="yovo-empty-state">
      {props.icon ? <Icon name={props.icon} size={40} /> : null}
      <div class="yovo-empty-state__title">{props.title}</div>
      {props.description ? <div class="yovo-empty-state__description">{props.description}</div> : null}
    </div>
  );
}
