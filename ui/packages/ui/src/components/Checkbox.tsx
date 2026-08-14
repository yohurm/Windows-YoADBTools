/**
 * YCheckbox —— 复选框。
 * 自绘方框 + 对勾，受控（checked + onChange）。
 */
import { Show } from "solid-js";
import type { JSX } from "solid-js";
import "./Checkbox.css";

export interface YCheckboxProps {
  /** 是否勾选 */
  checked?: boolean;
  /** 勾选状态变化回调 */
  onChange?: (checked: boolean) => void;
  /** 标签文本 */
  label?: string;
  /** 禁用 */
  disabled?: boolean;
}

/**
 * 渲染一个受控复选框。
 */
export function YCheckbox(props: YCheckboxProps): JSX.Element {
  const handleClick = (): void => {
    if (!props.disabled) {
      props.onChange?.(!props.checked);
    }
  };

  return (
    <label class="yovo-checkbox" classList={{ "yovo-checkbox--disabled": !!props.disabled }}>
      <span
        class="yovo-checkbox__box"
        classList={{ "yovo-checkbox__box--checked": !!props.checked }}
        role="checkbox"
        aria-checked={!!props.checked}
        aria-disabled={!!props.disabled}
        onClick={handleClick}
      >
        <Show when={props.checked}>
          <svg
            class="yovo-checkbox__check"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width={3}
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </Show>
      </span>
      {props.label ? <span class="yovo-checkbox__label">{props.label}</span> : null}
    </label>
  );
}
