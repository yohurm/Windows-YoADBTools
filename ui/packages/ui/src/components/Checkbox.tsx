/**
 * YoCheckbox —— 原生 checkbox + 自绘方框。
 * 受控（checked + onChange）；焦点环走 .yovo-focus-host。
 */
import { Show } from "solid-js";
import type { JSX } from "solid-js";
import "./Checkbox.css";

export interface YoCheckboxProps {
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
export function YoCheckbox(props: YoCheckboxProps): JSX.Element {
  return (
    <label class="yovo-checkbox" classList={{ "yovo-checkbox--disabled": !!props.disabled }}>
      <span
        class="yovo-checkbox__box yovo-focus-host"
        classList={{ "yovo-checkbox__box--checked": !!props.checked }}
      >
        <input
          type="checkbox"
          class="yovo-checkbox__input"
          checked={!!props.checked}
          disabled={props.disabled}
          onChange={(event) => {
            if (props.disabled) return;
            props.onChange?.(event.currentTarget.checked);
          }}
        />
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
