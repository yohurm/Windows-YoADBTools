/**
 * YTextField —— 单行输入框。
 * 受控组件（value + onInput），focus 时边框高亮 Accent；
 * clearable 时右侧显示清除按钮。
 * 采用受控 value 绑定，SolidJS 原生处理输入法组合（IME 安全）。
 */
import { createUniqueId } from "solid-js";
import type { JSX } from "solid-js";
import { Icon } from "../icons";
import "./TextField.css";

export interface YTextFieldProps {
  /** 标签 */
  label?: string;
  /** 受控值 */
  value?: string;
  /** 输入回调（携带新值与原事件） */
  onInput?: (value: string, event: InputEvent) => void;
  /** 占位文本 */
  placeholder?: string;
  /** 禁用 */
  disabled?: boolean;
  /** 是否显示清除按钮 */
  clearable?: boolean;
  /** 输入类型，默认 text */
  type?: string;
}

/**
 * 渲染一个带标签与可选清除按钮的受控输入框。
 */
export function YTextField(props: YTextFieldProps): JSX.Element {
  const id = createUniqueId();
  let inputRef: HTMLInputElement | undefined;

  const handleInput = (event: InputEvent): void => {
    const target = event.currentTarget as HTMLInputElement;
    props.onInput?.(target.value, event);
  };

  const handleClear = (): void => {
    if (inputRef) {
      inputRef.value = "";
      inputRef.focus();
    }
    props.onInput?.("", new InputEvent("input"));
  };

  const showClear = (): boolean => !!props.clearable && (props.value ?? "").length > 0;

  return (
    <div class="yovo-text-field" classList={{ "yovo-text-field--disabled": !!props.disabled }}>
      {props.label ? (
        <label class="yovo-text-field__label" for={id}>
          {props.label}
        </label>
      ) : null}
      <div class="yovo-text-field__control">
        <input
          ref={(el) => (inputRef = el)}
          id={id}
          class="yovo-text-field__input"
          type={props.type ?? "text"}
          value={props.value ?? ""}
          placeholder={props.placeholder ?? ""}
          disabled={props.disabled}
          onInput={handleInput}
        />
        {showClear() ? (
          <button
            type="button"
            class="yovo-text-field__clear"
            aria-label="clear"
            onClick={handleClear}
          >
            <Icon name="close" size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
