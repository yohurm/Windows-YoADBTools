/**
 * YoSelect —— 自绘下拉选择框。
 * HarmonyOS 对照：Select；触发钮 hug 内容，不默认拉满。
 * 受控 API：options / value / onChange / disabled / placeholder。
 *
 * 交互：
 * - 点击展开、点击外部关闭、Esc 关闭（逐层退出）
 * - 展开后 ↑/↓ 移动活动选项（aria-activedescendant）、Home/End 首尾、
 *   Enter/Space 选择、Tab 关闭并提交活动选项
 * - 触发钮 `aria-haspopup=listbox aria-expanded`；菜单 `role=listbox`；选项 `role=option`
 * - 菜单 Portal 到 body；按视口剩余空间向下或向上展开，高度夹在视口内，不撑页面
 */
import { For, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { Icon } from "../icons";
import { YoPresence } from "../motion/presence";
import { Spacing } from "../tokens/spacing";
import {
  placePopover,
  readViewport,
  type PlacePopoverResult,
  type PopoverPlacement,
} from "./popover-place";
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

/** 空字符串 value（如级别「全部」）不能生成 `yohu-option-` 这种残缺 id。 */
const optionDomId = (value: string): string => `yohu-option-${value === "" ? "empty" : value}`;

function boxStyle(box: PlacePopoverResult): JSX.CSSProperties {
  return {
    top: box.top === null ? "auto" : `${box.top}px`,
    bottom: box.bottom === null ? "auto" : `${box.bottom}px`,
    left: `${box.left}px`,
    width: `${box.width}px`,
    "max-height": `${box.maxHeight}px`,
  };
}

function cssPx(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 子节点尚未撑开时 scrollHeight 常为 0，必须用选项数估算，否则会误判「下方放得下」。 */
function estimateMenuHeight(menu: HTMLElement, optionCount: number, rowHeight: number): number {
  const measured = Math.max(menu.scrollHeight, menu.offsetHeight);
  const estimated = optionCount * rowHeight + Spacing.Xs * 2;
  return Math.max(measured, estimated);
}

function writeBox(menu: HTMLUListElement, box: PlacePopoverResult): void {
  const s = boxStyle(box);
  menu.style.top = String(s.top ?? "auto");
  menu.style.bottom = String(s.bottom ?? "auto");
  menu.style.left = String(s.left ?? "");
  menu.style.width = String(s.width ?? "");
  menu.style.maxHeight = String(s["max-height"] ?? "");
  menu.dataset.placement = box.placement;
  menu.dataset.placed = "true";
}

/**
 * 渲染一个自绘下拉选择框。
 */
export function YoSelect(props: YoSelectProps): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [activeIndex, setActiveIndex] = createSignal(-1);
  const [placement, setPlacement] = createSignal<PopoverPlacement>("bottom");
  const [menuStyle, setMenuStyle] = createSignal<JSX.CSSProperties>({});
  let rootRef: HTMLDivElement | undefined;
  let triggerRef: HTMLButtonElement | undefined;
  let menuRef: HTMLUListElement | undefined;

  const selected = (): YoSelectOption | undefined => props.options.find((o) => o.value === props.value);

  /** 当前活动选项值（用于 aria-activedescendant；索引为 -1 时回退选中项）。 */
  const activeValue = (): string => {
    const idx = activeIndex();
    if (idx >= 0 && props.options[idx]) return props.options[idx]!.value;
    return props.value ?? "";
  };

  const layoutMenu = (): void => {
    const trigger = triggerRef;
    const menu = menuRef;
    if (!trigger || !menu) return;
    const rect = trigger.getBoundingClientRect();
    const row = rect.height || cssPx("--yohu-control-height", 32);
    const box = placePopover({
      trigger: { top: rect.top, left: rect.left, bottom: rect.bottom, width: rect.width },
      menuHeight: estimateMenuHeight(menu, props.options.length, row),
      viewport: readViewport(),
      gap: Spacing.Sm,
      maxHeightCap: Spacing.Xl * 10,
    });
    writeBox(menu, box);
    setPlacement(box.placement);
    setMenuStyle(boxStyle(box));
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
      const target = event.target as Node;
      if (rootRef?.contains(target) || menuRef?.contains(target)) return;
      setOpen(false);
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

  createEffect(() => {
    if (!open()) return;
    const frame = requestAnimationFrame(() => layoutMenu());
    const onRelayout = (): void => layoutMenu();
    window.addEventListener("resize", onRelayout);
    window.addEventListener("scroll", onRelayout, true);
    window.visualViewport?.addEventListener("resize", onRelayout);
    window.visualViewport?.addEventListener("scroll", onRelayout);
    onCleanup(() => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onRelayout);
      window.removeEventListener("scroll", onRelayout, true);
      window.visualViewport?.removeEventListener("resize", onRelayout);
      window.visualViewport?.removeEventListener("scroll", onRelayout);
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
        aria-activedescendant={open() ? optionDomId(activeValue()) : undefined}
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
      <Portal mount={document.body}>
        <YoPresence when={open()} recipe="popover">
          <ul
            ref={(el) => {
              menuRef = el;
              if (el) layoutMenu();
            }}
            class="yohu-select__menu"
            data-placement={placement()}
            role="listbox"
            style={menuStyle()}
          >
            <For each={props.options}>
              {(option, index) => (
                <li
                  id={optionDomId(option.value)}
                  class="yohu-select__option yohu-interactive"
                  classList={{
                    "yohu-interactive--selected": option.value === props.value,
                    "yohu-interactive--active": index() === activeIndex(),
                  }}
                  role="option"
                  aria-selected={option.value === props.value}
                  onMouseEnter={() => setActiveIndex(index())}
                  onClick={() => handleSelect(option.value)}
                >
                  {/* 包一层元素：.yohu-interactive > * 才能抬到选中片之上 */}
                  <span class="yohu-select__option-label">{option.label}</span>
                </li>
              )}
            </For>
          </ul>
        </YoPresence>
      </Portal>
    </div>
  );
}
