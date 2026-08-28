/**
 * YoTabs —— 多会话标签页。
 * HarmonyOS 对照：Tabs；激活项 Accent 下划线。
 * 受控 API：tabs / activeId / onActivate / onClose / onNew / onContextMenu。
 *
 * 可达性：
 * - `role=tablist/tab` + `aria-selected` + **roving tabindex**（仅激活 tab 在 Tab 序中）
 * - ←/→ 循环切换（自动激活）；Home/End 首尾；Delete 关闭（提供 onClose 时，自动聚焦相邻）
 * - 关闭按钮 `aria-label=close`；`+` 新建按钮 `aria-label=new tab`
 *
 * 视觉：激活项 Accent 下划线由 YoIndicator 在项之间滑动；hover 仍走 ripple。
 */
import { For, createSignal, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { Icon } from "../icons";
import { Layout } from "../tokens/layout";
import { YoIndicator } from "../motion/indicator";
import { closeFocusIndex, tabsKeyIntent } from "./tabs-model";
import "./Tabs.css";

/** 圆点色调 */
export type YoTabDotTone = "neutral" | "accent" | "success" | "warn" | "error";

export interface YoTabDot {
  /** 圆点语义色调 */
  tone: YoTabDotTone;
}

export interface YoTabItem {
  /** 标签唯一 id */
  id: string;
  /** 标签标题 */
  title: string;
  /** 状态圆点 */
  dot?: YoTabDot;
}

export interface YoTabsProps {
  /** 标签列表 */
  tabs: YoTabItem[];
  /** 激活标签 id */
  activeId?: string | null;
  /** 激活回调 */
  onActivate?: (id: string) => void;
  /** 关闭回调（提供时显示 ×） */
  onClose?: (id: string) => void;
  /** 新建回调（提供时显示 +） */
  onNew?: () => void;
  /** 标签右键菜单（id + 原始事件；由调用方定位菜单） */
  onContextMenu?: (id: string, event: MouseEvent) => void;
}

/**
 * 渲染一条多会话标签页栏。
 */
export function YoTabs(props: YoTabsProps): JSX.Element {
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
    const intent = tabsKeyIntent(event.key, index, count, Boolean(props.onClose));
    if (!intent) return;
    event.preventDefault();
    if (intent.type === "activate") {
      const tab = props.tabs[intent.index];
      if (!tab) return;
      props.onActivate?.(tab.id);
      focusIndex(intent.index);
      return;
    }
    props.onClose?.(props.tabs[intent.index]!.id);
    focusIndex(closeFocusIndex(intent.index, count));
  };

  onMount(() => {
    setFocusedId(props.activeId ?? null);
  });

  return (
    <div
      ref={(el) => (tablistRef = el)}
      class="yohu-tabs"
      role="tablist"
      aria-label="会话"
      onKeyDown={onTablistKeyDown}
    >
      <YoIndicator follow={props.activeId} variant="underline" selector=".yohu-tabs__tab--active" />
      <For each={props.tabs}>
        {(tab) => {
          const active = (): boolean => tab.id === props.activeId;
          return (
            <div
              data-tab-id={tab.id}
              class="yohu-tabs__tab yohu-interactive yohu-focus-ring--inset"
              classList={{ "yohu-tabs__tab--active": active() }}
              role="tab"
              aria-selected={active()}
              tabindex={active() ? 0 : -1}
              onClick={() => {
                props.onActivate?.(tab.id);
                setFocusedId(tab.id);
              }}
              onContextMenu={(event) => props.onContextMenu?.(tab.id, event)}
            >
              {tab.dot ? (
                <span class="yohu-tabs__dot" classList={{ [`yohu-tabs__dot--${tab.dot.tone}`]: true }} />
              ) : null}
              <span class="yohu-tabs__title">{tab.title}</span>
              {props.onClose ? (
                <button
                  type="button"
                  class="yohu-tabs__close yohu-interactive yohu-focus-ring"
                  aria-label="关闭页签"
                  onClick={(event) => handleClose(tab.id, event)}
                >
                  <Icon name="close" size={Layout.IconTiny} />
                </button>
              ) : null}
            </div>
          );
        }}
      </For>
      {props.onNew ? (
        <button type="button" class="yohu-tabs__new yohu-interactive yohu-focus-ring" aria-label="新建页签" onClick={props.onNew}>
          <Icon name="plus" size={Layout.IconInline} />
        </button>
      ) : null}
    </div>
  );
}
