/**
 * YoCheckbox —— 复选框（多选/条件，不是启用开关）。
 * HarmonyOS 对照：Checkbox；启用类场景改走 YoSwitch。
 * 受控 API：checked / onChange / label / disabled。
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
    <label class="yohu-checkbox" classList={{ "yohu-checkbox--disabled": !!props.disabled }}>
      <span
        class="yohu-checkbox__box yohu-focus-host"
        classList={{ "yohu-checkbox__box--checked": !!props.checked }}
      >
        <input
          type="checkbox"
          class="yohu-checkbox__input"
          checked={!!props.checked}
          disabled={props.disabled}
          onChange={(event) => {
            if (props.disabled) return;
            props.onChange?.(event.currentTarget.checked);
          }}
        />
        <Show when={props.checked}>
          <svg
            class="yohu-checkbox__check"
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
      {props.label ? <span class="yohu-checkbox__label">{props.label}</span> : null}
    </label>
  );
}
