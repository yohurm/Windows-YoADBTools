/**
 * YoContextMenu —— 右键菜单呈现（L0）。
 * HarmonyOS 对照：Menu；电脑默认最小宽 224vp；Esc / 点击外侧关闭。
 * 页面不要直接挂本组件：走 defineContextMenu + openContextMenu + 壳上的 YoContextMenuHost。
 */
import { createEffect, For, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js";
import type { YoMenuItem } from "../context-menu/types";
import { YoPresence } from "../motion/presence";
import "./ContextMenu.css";

export type { YoMenuItem };

export interface YoContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  items: YoMenuItem[];
  onClose: () => void;
  onSelect: (id: string) => void;
  /** 测量回调：菜单挂载/布局就绪后上报实测宽高，供外层按真实尺寸二次夹紧。 */
  onPlace?: (size: { width: number; height: number }) => void;
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

  // 打开后等一帧测量真实尺寸上报：估算宽（Layout.MenuMin）对更宽条目偏小，
  // 实测后由控制器按 clampToRect 二次夹紧，避免贴右/下边溢出。
  createEffect(() => {
    if (!props.open || !props.onPlace) return;
    queueMicrotask(() => {
      if (!root) return;
      props.onPlace?.({ width: root.offsetWidth, height: root.offsetHeight });
    });
  });

  return (
    <YoPresence when={props.open} recipe="popover">
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
    </YoPresence>
  );
}
