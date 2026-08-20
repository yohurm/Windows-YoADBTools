/**
 * YoSegmentedButton —— 单选分段按钮。
 * HarmonyOS 对照：SegmentButtonV2；tab 白选择块 / capsule 强调块。
 * 受控 API：items / value / onChange / type / size。
 *
 * 架构：
 * - 选中/键盘算法在 segmented-model.ts
 * - 选择块走 YoIndicator（配方 indicator），几何按 item 实测盒
 * - 类型 tab / capsule 只换色板，不换交互
 *
 * 默认 tab：白选择块 + 32vp 圆角 + OUTER_DEFAULT_XS 阴影 + 主色字。
 * 页签栏（多会话关闭/新建）仍走 YoTabs；本组件不作一级导航，不承载删除/添加。
 *
 * 键盘：radiogroup + ←/→/↑/↓ 循环；Home/End 首尾；焦点跟随选中。
 */
import { For } from "solid-js";
import type { JSX } from "solid-js";

import { Icon, type IconName } from "../icons";
import { YoIndicator } from "../motion/indicator";
import {
  isHybridItems,
  resolveKeyIndex,
  type YoSegmentedButtonSize,
  type YoSegmentedType,
} from "./segmented-model";
import "./SegmentedButton.css";

export type { YoSegmentedButtonSize, YoSegmentedType };

export interface YoSegmentedItem {
  /** 选项值（受控 value 对账） */
  value: string;
  /** 文本；可与 icon 组合（鸿蒙 hybrid） */
  label?: string;
  /** 可选图标（与 Icon 单源） */
  icon?: IconName;
  /** 单项不可用（鸿蒙 enabled=false） */
  disabled?: boolean;
}

export interface YoSegmentedButtonProps {
  /** 选项集合（鸿蒙 items；大屏建议 ≤7） */
  items: YoSegmentedItem[];
  /** 当前值 */
  value: string;
  /** 选中变更（值变化才触发） */
  onChange?: (value: string) => void;
  /** 单击项（含再次点击当前项，对齐 onItemClicked） */
  onItemClick?: (index: number) => void;
  /**
   * tab：白选择块（V2 Tab 默认）。
   * capsule：强调色选择块（V2 Capsule 默认）。
   */
  type?: YoSegmentedType;
  /** 字号：sm=caption / md=body（14fp，鸿蒙默认）。高度由密度与是否图文决定。 */
  size?: YoSegmentedButtonSize;
  /** 整组禁用 */
  disabled?: boolean;
  /** 无障碍名 */
  ariaLabel?: string;
}

/**
 * 渲染单选分段按钮。
 */
export function YoSegmentedButton(props: YoSegmentedButtonProps): JSX.Element {
  const itemRefs: Array<HTMLButtonElement | undefined> = [];

  const kind = (): YoSegmentedType => props.type ?? "tab";
  const size = (): YoSegmentedButtonSize => props.size ?? "md";
  const hybrid = (): boolean => isHybridItems(props.items);
  const iconPx = (): number => (hybrid() ? 20 : size() === "sm" ? 16 : 20);

  const commitIndex = (index: number, focus: boolean): void => {
    if (props.disabled) return;
    const item = props.items[index];
    if (!item || item.disabled) return;
    props.onItemClick?.(index);
    if (item.value !== props.value) {
      props.onChange?.(item.value);
    }
    if (focus) {
      queueMicrotask(() => itemRefs[index]?.focus());
    }
  };

  const onGroupKeyDown = (event: KeyboardEvent): void => {
    if (props.disabled) return;
    const next = resolveKeyIndex(props.items, props.value, event.key);
    if (next === undefined) return;
    event.preventDefault();
    commitIndex(next, true);
  };

  return (
    <div
      class="yohu-segmented"
      classList={{
        [`yohu-segmented--${kind()}`]: true,
        [`yohu-segmented--${size()}`]: true,
        "yohu-segmented--hybrid": hybrid(),
        "yohu-segmented--disabled": !!props.disabled,
      }}
      role="radiogroup"
      aria-label={props.ariaLabel}
      aria-disabled={props.disabled || undefined}
      onKeyDown={onGroupKeyDown}
    >
      <YoIndicator follow={props.value} variant="thumb" selector=".yohu-segmented__item--selected" />
      <For each={props.items}>
        {(item, index) => {
          const selected = () => item.value === props.value;
          const itemDisabled = () => !!props.disabled || !!item.disabled;
          return (
            <button
              ref={(el) => {
                itemRefs[index()] = el;
              }}
              type="button"
              class="yohu-segmented__item yohu-focus-ring--inset"
              classList={{ "yohu-segmented__item--selected": selected() }}
              role="radio"
              aria-checked={selected()}
              aria-label={item.label}
              disabled={itemDisabled()}
              tabIndex={selected() ? 0 : -1}
              onClick={() => commitIndex(index(), false)}
            >
              {item.icon ? <Icon name={item.icon} size={iconPx()} /> : null}
              {item.label ? <span class="yohu-segmented__label">{item.label}</span> : null}
            </button>
          );
        }}
      </For>
    </div>
  );
}
