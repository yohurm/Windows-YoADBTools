/**
 * YoProgressBar —— 进度条。
 * value(0-100) 确定态；indeterminate 时为不定态动画。
 */
import type { JSX } from "solid-js";
import "./ProgressBar.css";

export interface YoProgressBarProps {
  /** 进度值 0-100 */
  value?: number;
  /** 不定态 */
  indeterminate?: boolean;
}

/** 将进度值夹取到 0-100 */
function clampValue(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * 渲染一个确定态或不定态进度条。
 */
export function YoProgressBar(props: YoProgressBarProps): JSX.Element {
  const width = (): string => `${clampValue(props.value ?? 0)}%`;
  return (
    <div
      class="yovo-progress"
      classList={{ "yovo-progress--indeterminate": !!props.indeterminate }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={props.indeterminate ? undefined : clampValue(props.value ?? 0)}
    >
      <div class="yovo-progress__bar" style={{ width: width() }} />
    </div>
  );
}
