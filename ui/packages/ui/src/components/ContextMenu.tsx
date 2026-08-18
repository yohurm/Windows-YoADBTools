/**
 * YoContextMenu —— 模块右键菜单（UI设计系统-v6.md §5）。
 * 定位到指针处；Esc / 点击外侧关闭；条目由调用方按模块给出。
 */
import { For, Show, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js";
import "./ContextMenu.css";

export interface YoMenuItem {
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
}

export interface YoContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  items: YoMenuItem[];
  onClose: () => void;
  onSelect: (id: string) => void;
}

export function YoContextMenu(props: YoContextMenuProps): JSX.Element {
  let root: HTMLDivElement | undefined;

  const onDoc = (event: MouseEvent): void => {
    if (!root) return;
    if (!root.contains(event.target as Node)) props.onClose();
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") props.onClose();
  };

  onMount(() => {
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    });
  });

  return (
    <Show when={props.open}>
      <div
        ref={(el) => {
          root = el;
        }}
        class="yohu-context-menu"
        role="menu"
        style={{ left: `${props.x}px`, top: `${props.y}px` }}
      >
        <For each={props.items}>
          {(item) => (
            <button
              type="button"
              role="menuitem"
              class="yohu-context-menu__item yohu-interactive yohu-focus-ring--inset"
              classList={{ "yohu-context-menu__item--danger": !!item.danger }}
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                props.onSelect(item.id);
                props.onClose();
              }}
            >
              <span>{item.label}</span>
            </button>
          )}
        </For>
      </div>
    </Show>
  );
}
