/**
 * YoSelect —— 自绘下拉选择框（L4 视图 / L5 门面）。
 * HarmonyOS 对照：Select。定位策略在 popover-place；选中/键盘在 select-model。
 * 受控 API：options / value / onChange / disabled / placeholder / block。
 * 默认 hug 选中文案；最小宽在触发钮上（禁止写在根上，否则短文案按钮靠左）。
 *
 * 交互：
 * - 点击展开、点击外部关闭、Esc 关闭（逐层退出）
 * - 展开后 ↑/↓ 移动活动选项（aria-activedescendant）、Home/End 首尾、
 *   Enter/Space 选择、Tab 关闭并提交活动选项
 * - 触发钮 `aria-haspopup=listbox aria-expanded`；菜单 `role=listbox`；选项 `role=option`
 * - 菜单 Portal 到 body；宽 hug 内容（min=触发钮）；高 hug 内容，仅超出视口才纵向滚动
 */
import { For, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { Icon } from "../icons";
import { YoIndicator } from "../motion/indicator";
import { YoPresence } from "../motion/presence";
import { Layout } from "../tokens/layout";
import { Spacing } from "../tokens/spacing";
import {
  applyPopoverBox,
  estimateMenuHeight,
  placePopover,
  popoverLayerStyle,
  readCssPx,
  readViewport,
  type PopoverPlacement,
} from "./popover-place";
import {
  edgeIndex,
  findOption,
  optionDomId,
  selectedIndex,
  selectKeyIntent,
  stepIndex,
  type YoSelectOption,
} from "./select-model";
import "./Select.css";

export type { YoSelectOption };

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
  /** 拉满父级宽度（表单行）；默认 hug 选中文案 */
  block?: boolean;
}

/**
 * 渲染一个自绘下拉选择框。
 */
export function YoSelect(props: YoSelectProps): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [activeIndex, setActiveIndex] = createSignal(-1);
  const [placement, setPlacement] = createSignal<PopoverPlacement>("bottom");
  const [overflowY, setOverflowY] = createSignal(false);
  const [menuStyle, setMenuStyle] = createSignal<JSX.CSSProperties>({});
  let rootRef: HTMLDivElement | undefined;
  let triggerRef: HTMLButtonElement | undefined;
  let layerRef: HTMLDivElement | undefined;
  let menuRef: HTMLDivElement | undefined;

  const selected = (): YoSelectOption | undefined => findOption(props.options, props.value);

  const activeValue = (): string => {
    const idx = activeIndex();
    if (idx >= 0 && props.options[idx]) return props.options[idx]!.value;
    return props.value ?? "";
  };

  const layoutMenu = (): void => {
    const trigger = triggerRef;
    const layer = layerRef;
    const menu = menuRef;
    if (!trigger || !layer || !menu) return;
    const rect = trigger.getBoundingClientRect();
    const row = rect.height || readCssPx("--yohu-control-height", 32);
    const box = placePopover({
      trigger: { top: rect.top, left: rect.left, bottom: rect.bottom, width: rect.width },
      menuHeight: Math.max(menu.scrollHeight, estimateMenuHeight(props.options.length, row, Spacing.Xs * 2)),
      viewport: readViewport(),
      gap: Spacing.Sm,
      maxHeightCap: Spacing.Xl * 10,
    });
    applyPopoverBox(layer, box);
    setPlacement(box.placement);
    setOverflowY(box.overflowY);
    setMenuStyle(popoverLayerStyle(box) as JSX.CSSProperties);
  };

  const handleSelect = (value: string): void => {
    props.onChange?.(value);
    setOpen(false);
    triggerRef?.focus();
  };

  const openMenu = (): void => {
    const wasOpen = open();
    setOpen(!wasOpen);
    if (!wasOpen) {
      setActiveIndex(selectedIndex(props.options, props.value));
    }
  };

  const moveActive = (delta: number): void => {
    if (!open()) {
      openMenu();
      return;
    }
    setActiveIndex((i) => stepIndex(props.options.length, i, delta));
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
      if (rootRef?.contains(target) || layerRef?.contains(target)) return;
      setOpen(false);
    };
    const handleDocKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || !open()) return;
      // 逐层退出契约：菜单打开时本层为“最内浮层”，Esc 只消费本层的 Esc 并向下收口。
      // stopImmediatePropagation 在 document (capture) 阶段阻断后续同节点监听器（含外层 Dialog 的 document 级 Esc），
      // 使这一次 Esc 只关闭本 Select；外层 Dialog 在菜单关闭后的下一次 Esc 才收到事件并退出。
      // 需要与 Dialog 内嵌 Select 的“逐层退出”行为保持不变（见 Select.test.tsx）。
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      triggerRef?.focus();
    };
    document.addEventListener("mousedown", handleDocPointerDown);
    document.addEventListener("keydown", handleDocKeyDown, true);
    onCleanup(() => {
      document.removeEventListener("mousedown", handleDocPointerDown);
      document.removeEventListener("keydown", handleDocKeyDown, true);
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
    const intent = selectKeyIntent(event.key, open());
    if (!intent) return;
    switch (intent.type) {
      case "step":
        event.preventDefault();
        moveActive(intent.delta);
        break;
      case "edge":
        event.preventDefault();
        if (props.options.length > 0) setActiveIndex(edgeIndex(props.options.length, intent.edge));
        break;
      case "toggle":
        event.preventDefault();
        openMenu();
        break;
      case "commit":
        event.preventDefault();
        commitActive();
        break;
      case "tabCommit":
        // 提交活动选项并关闭。preventDefault 不与浏览器默认 Tab 迁移（及受限焦点上下文如 Dialog
        // 内由 Dialog 焦点陷阱接管的 Tab 序）争抢：提交后焦点落在触发钮（handleSelect 内 focus），
        // 后续 Tab 顺序交由所在焦点上下文（普通页面按文档序 / Dialog 陷阱在边界回绕）。
        event.preventDefault();
        commitActive();
        break;
    }
  };

  return (
    <div
      ref={(el) => (rootRef = el)}
      class="yohu-select"
      classList={{
        "yohu-select--disabled": !!props.disabled,
        "yohu-select--block": !!props.block,
      }}
    >
      <button
        ref={(el) => (triggerRef = el)}
        type="button"
        class="yohu-select__trigger yohu-focus-ring"
        disabled={props.disabled}
        title={selected()?.label}
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
        <span class="yohu-select__chevron" aria-hidden="true">
          <Icon name="chevron-down" size={Layout.IconInline} />
        </span>
      </button>
      <Portal mount={document.body}>
        <YoPresence when={open()} recipe="popover">
          <div
            ref={(el) => {
              layerRef = el;
              if (el) layoutMenu();
            }}
            class="yohu-select__layer"
            data-placement={placement()}
            data-overflow-y={overflowY() ? "" : undefined}
            style={menuStyle()}
          >
            <div
              ref={(el) => {
                menuRef = el;
                if (el) layoutMenu();
              }}
              class="yohu-select__menu"
              data-placement={placement()}
              role="listbox"
            >
              <YoIndicator follow={props.value} variant="fill" />
              <For each={props.options}>
                {(option, index) => (
                  <div
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
                    <span class="yohu-select__option-label">{option.label}</span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </YoPresence>
      </Portal>
    </div>
  );
}
