/**
 * YTabs —— 多会话标签页（对齐 Kobalte Tabs 可达性模型）。
 *
 * 可达性：
 * - `role=tablist/tab` + `aria-selected` + **roving tabindex**（仅激活 tab 在 Tab 序中）
 * - ←/→ 循环切换（自动激活）；Home/End 首尾；Delete 关闭（提供 onClose 时，自动聚焦相邻）
 * - 关闭按钮 `aria-label=close`；`+` 新建按钮 `aria-label=new tab`
 *
 * 视觉：激活项 Accent 下划线（transition 用动效 token）；dot 为状态圆点。
 */
import { For, createSignal, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { Icon } from "../icons";
import "./Tabs.css";

/** 圆点色调 */
export type YTabDotTone = "neutral" | "accent" | "success" | "warn" | "error";

export interface YTabDot {
  /** 圆点语义色调 */
  tone: YTabDotTone;
}

export interface YTabItem {
  /** 标签唯一 id */
  id: string;
  /** 标签标题 */
  title: string;
  /** 状态圆点 */
  dot?: YTabDot;
}

export interface YTabsProps {
  /** 标签列表 */
  tabs: YTabItem[];
  /** 激活标签 id */
  activeId?: string | null;
  /** 激活回调 */
  onActivate?: (id: string) => void;
  /** 关闭回调（提供时显示 ×） */
  onClose?: (id: string) => void;
  /** 新建回调（提供时显示 +） */
  onNew?: () => void;
}

/**
 * 渲染一条多会话标签页栏。
 */
export function YTabs(props: YTabsProps): JSX.Element {
  const [focusedId, setFocusedId] = createSignal<string | null>(null);
  let tablistRef: HTMLDivElement | undefined;

  const handleClose = (id: string, event: MouseEvent): void => {
    event.stopPropagation();
    props.onClose?.(id);
  };

  const activeIndex = (): number => props.tabs.findIndex((t) => t.id === props.activeId);

  const focusIndex = (index: number): void => {
    const tab = props.tabs[index];
    if (!tab) return;
    setFocusedId(tab.id);
    const el = tablistRef?.querySelector<HTMLElement>(`[data-tab-id="${tab.id}"]`);
    el?.focus();
  };

  const onTablistKeyDown = (event: KeyboardEvent): void => {
    const index = activeIndex();
    const count = props.tabs.length;
    if (count === 0) return;
    const current = index >= 0 ? index : 0;
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        props.onActivate?.(props.tabs[(current + 1) % count]!.id);
        focusIndex((current + 1) % count);
        break;
      case "ArrowLeft":
        event.preventDefault();
        props.onActivate?.(props.tabs[(current - 1 + count) % count]!.id);
        focusIndex((current - 1 + count) % count);
        break;
      case "Home":
        event.preventDefault();
        props.onActivate?.(props.tabs[0]!.id);
        focusIndex(0);
        break;
      case "End":
        event.preventDefault();
        props.onActivate?.(props.tabs[count - 1]!.id);
        focusIndex(count - 1);
        break;
      case "Delete":
        if (props.onClose && index >= 0) {
          event.preventDefault();
          props.onClose(props.tabs[index]!.id);
          // 焦点交给相邻 tab（关闭由上层完成后再聚焦）
          const next = Math.min(index, count - 2);
          focusIndex(next);
        }
        break;
    }
  };

  onMount(() => {
    setFocusedId(props.activeId ?? null);
  });

  return (
    <div
      ref={(el) => (tablistRef = el)}
      class="yovo-tabs"
      role="tablist"
      aria-label="会话"
      onKeyDown={onTablistKeyDown}
    >
      <For each={props.tabs}>
        {(tab) => {
          const active = (): boolean => tab.id === props.activeId;
          return (
            <div
              data-tab-id={tab.id}
              class="yovo-tabs__tab"
              classList={{ "yovo-tabs__tab--active": active() }}
              role="tab"
              aria-selected={active()}
              tabindex={active() ? 0 : -1}
              onClick={() => {
                props.onActivate?.(tab.id);
                setFocusedId(tab.id);
              }}
            >
              {tab.dot ? (
                <span class="yovo-tabs__dot" classList={{ [`yovo-tabs__dot--${tab.dot.tone}`]: true }} />
              ) : null}
              <span class="yovo-tabs__title">{tab.title}</span>
              {props.onClose ? (
                <button
                  type="button"
                  class="yovo-tabs__close"
                  aria-label="close"
                  onClick={(event) => handleClose(tab.id, event)}
                >
                  <Icon name="close" size={12} />
                </button>
              ) : null}
            </div>
          );
        }}
      </For>
      {props.onNew ? (
        <button type="button" class="yovo-tabs__new" aria-label="new tab" onClick={props.onNew}>
          <Icon name="plus" size={14} />
        </button>
      ) : null}
    </div>
  );
}
