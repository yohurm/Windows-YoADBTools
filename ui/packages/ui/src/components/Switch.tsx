/**
 * YoSwitch —— 列表/设置行开关。
 * HarmonyOS 对照：ToggleType.Switch；默认 36×20vp；开=brand，关=comp_background_secondary；滑块 font_on。
 * 受控 API：checked / onChange / ariaLabel / disabled。
 *
 * 只点击开关本身（不响应整行）。role=switch。
 */
import type { JSX } from "solid-js";
import "./Switch.css";

export interface YoSwitchProps {
  /** 是否开启 */
  checked?: boolean;
  /** 状态变化 */
  onChange?: (checked: boolean) => void;
  /** 无障碍名称（设置行标签在左侧时必填） */
  ariaLabel: string;
  /** 禁用 */
  disabled?: boolean;
}

/**
 * 渲染一个受控开关（role=switch）。
 */
export function YoSwitch(props: YoSwitchProps): JSX.Element {
  const toggle = (): void => {
    if (props.disabled) return;
    props.onChange?.(!props.checked);
  };

  return (
    <button
      type="button"
      role="switch"
      class="yohu-switch yohu-focus-ring"
      classList={{
        "yohu-switch--on": !!props.checked,
        "yohu-switch--disabled": !!props.disabled,
      }}
      aria-checked={!!props.checked}
      aria-label={props.ariaLabel}
      disabled={props.disabled}
      onClick={toggle}
    >
      <span class="yohu-switch__thumb" aria-hidden="true" />
    </button>
  );
}
