/**
 * YTabs —— 多会话标签页。
 * 激活项显示 Accent 下划线；dot 为小圆点（成功绿/错误红等）；
 * 关闭按钮 ×；提供 onNew 时显示 `+` 新建按钮。
 */
import { For } from "solid-js";
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
  const handleClose = (id: string, event: MouseEvent): void => {
    event.stopPropagation();
    props.onClose?.(id);
  };

  return (
    <div class="yovo-tabs" role="tablist">
      <For each={props.tabs}>
        {(tab) => (
          <div
            class="yovo-tabs__tab"
            classList={{ "yovo-tabs__tab--active": tab.id === props.activeId }}
            role="tab"
            aria-selected={tab.id === props.activeId}
            onClick={() => props.onActivate?.(tab.id)}
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
        )}
      </For>
      {props.onNew ? (
        <button type="button" class="yovo-tabs__new" aria-label="new tab" onClick={props.onNew}>
          <Icon name="plus" size={14} />
        </button>
      ) : null}
    </div>
  );
}
