/**
 * YoSelect —— 自绘下拉选择框（对齐 Kobalte Select 可达性模型）。
 *
 * 交互：
 * - 点击展开、点击外部关闭、Esc 关闭（逐层退出）
 * - 展开后 ↑/↓ 移动活动选项（aria-activedescendant）、Home/End 首尾、
 *   Enter/Space 选择、Tab 关闭并提交活动选项
 * - 触发钮 `aria-haspopup=listbox aria-expanded`；菜单 `role=listbox`；选项 `role=option`
 */
import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { Icon } from "../icons";
import "./Select.css";

export interface YoSelectOption {
  /** 选项值 */
  value: string;
  /** 选项显示文本 */
  label: string;
}

export interface YoSelectProps {
  /** 选项列表 */
  options: YoSelectOption[];
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
export function YoSelect(props: YoSelectProps): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [activeIndex, setActiveIndex] = createSignal(-1);
  let rootRef: HTMLDivElement | undefined;
  let triggerRef: HTMLButtonElement | undefined;

  const selected = (): YoSelectOption | undefined => props.options.find((o) => o.value === props.value);

  /** 当前活动选项值（用于 aria-activedescendant；索引为 -1 时回退选中项）。 */
  const activeValue = (): string => {
    const idx = activeIndex();
    if (idx >= 0 && props.options[idx]) return props.options[idx]!.value;
    return props.value ?? "";
  };

  const handleSelect = (value: string): void => {
    props.onChange?.(value);
    setOpen(false);
    triggerRef?.focus();
  };

  /** 展开时初始化活动项为当前选中项。 */
  const openMenu = (): void => {
    const wasOpen = open();
    setOpen(!wasOpen);
    if (!wasOpen) {
      const idx = props.options.findIndex((o) => o.value === props.value);
      setActiveIndex(idx);
    }
  };

  const moveActive = (delta: number): void => {
    if (!open()) {
      openMenu();
      return;
    }
    setActiveIndex((i) => {
      const n = props.options.length;
      if (n === 0) return -1;
      return (i + delta + n) % n;
    });
  };

  const commitActive = (): void => {
    const idx = activeIndex();
    if (open() && idx >= 0 && props.options[idx]) {
      handleSelect(props.options[idx]!.value);
    }
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
        triggerRef?.focus();
      }
    };
    document.addEventListener("mousedown", handleDocPointerDown);
    document.addEventListener("keydown", handleDocKeyDown);
    onCleanup(() => {
      document.removeEventListener("mousedown", handleDocPointerDown);
      document.removeEventListener("keydown", handleDocKeyDown);
    });
  });

  const onTriggerKeyDown = (event: KeyboardEvent): void => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        event.preventDefault();
        if (open() && props.options.length > 0) setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        if (open() && props.options.length > 0) setActiveIndex(props.options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open()) {
          commitActive();
        } else {
          openMenu();
        }
        break;
      case "Tab":
        if (open()) {
          commitActive();
        }
        break;
    }
  };

  return (
    <div ref={(el) => (rootRef = el)} class="yohu-select" classList={{ "yohu-select--disabled": !!props.disabled }}>
      <button
        ref={(el) => (triggerRef = el)}
        type="button"
        class="yohu-select__trigger yohu-focus-ring"
        disabled={props.disabled}
        aria-haspopup="listbox"
        aria-expanded={open()}
        aria-activedescendant={open() ? `yohu-option-${activeValue()}` : undefined}
        onClick={openMenu}
        onKeyDown={onTriggerKeyDown}
      >
        <span
          class="yohu-select__value"
          classList={{ "yohu-select__value--placeholder": !selected() }}
        >
          {selected()?.label ?? props.placeholder ?? ""}
        </span>
        <Icon name="chevron-down" size={14} />
      </button>
      <Show when={open()}>
        <ul class="yohu-select__menu" role="listbox">
          <For each={props.options}>
            {(option, index) => (
              <li
                id={`yohu-option-${option.value}`}
                class="yohu-select__option yohu-interactive"
                classList={{
                  "yohu-select__option--selected": option.value === props.value,
                  "yohu-interactive--selected": option.value === props.value,
                  "yohu-interactive--active": index() === activeIndex(),
                }}
                role="option"
                aria-selected={option.value === props.value}
                onMouseEnter={() => setActiveIndex(index())}
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
