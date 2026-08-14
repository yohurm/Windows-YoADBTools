/**
 * YSelect —— 自绘下拉选择框。
 * 点击展开、点击外部关闭、键盘 Esc 关闭、选择后关闭。
 */
import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { Icon } from "../icons";
import "./Select.css";

export interface YSelectOption {
  /** 选项值 */
  value: string;
  /** 选项显示文本 */
  label: string;
}

export interface YSelectProps {
  /** 选项列表 */
  options: YSelectOption[];
  /** 当前值 */
  value?: string | null;
  /** 选择回调 */
  onChange?: (value: string) => void;
  /** 禁用 */
  disabled?: boolean;
  /** 未选中时的占位文本 */
  placeholder?: string;
}

/**
 * 渲染一个自绘下拉选择框。
 */
export function YSelect(props: YSelectProps): JSX.Element {
  const [open, setOpen] = createSignal(false);
  let rootRef: HTMLDivElement | undefined;

  const selected = (): YSelectOption | undefined => props.options.find((o) => o.value === props.value);

  const handleSelect = (value: string): void => {
    props.onChange?.(value);
    setOpen(false);
  };

  onMount(() => {
    const handleDocPointerDown = (event: MouseEvent): void => {
      if (rootRef && !rootRef.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleDocKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleDocPointerDown);
    document.addEventListener("keydown", handleDocKeyDown);
    onCleanup(() => {
      document.removeEventListener("mousedown", handleDocPointerDown);
      document.removeEventListener("keydown", handleDocKeyDown);
    });
  });

  return (
    <div ref={(el) => (rootRef = el)} class="yovo-select" classList={{ "yovo-select--disabled": !!props.disabled }}>
      <button
        type="button"
        class="yovo-select__trigger"
        disabled={props.disabled}
        aria-haspopup="listbox"
        aria-expanded={open()}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          class="yovo-select__value"
          classList={{ "yovo-select__value--placeholder": !selected() }}
        >
          {selected()?.label ?? props.placeholder ?? ""}
        </span>
        <Icon name="chevron-down" size={14} />
      </button>
      <Show when={open()}>
        <ul class="yovo-select__menu" role="listbox">
          <For each={props.options}>
            {(option) => (
              <li
                class="yovo-select__option"
                classList={{ "yovo-select__option--selected": option.value === props.value }}
                role="option"
                aria-selected={option.value === props.value}
                onClick={() => handleSelect(option.value)}
              >
                {option.label}
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
