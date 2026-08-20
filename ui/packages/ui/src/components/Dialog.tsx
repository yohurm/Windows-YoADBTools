/**
 * YoDialog —— 模态对话框。
 * HarmonyOS 对照：弹出框；最大宽 400vp；遮罩 10% 中性，不点遮罩关闭。
 * 受控 API：open / title / width / height / onClose / footer / children。
 *
 * 可达性：
 * - `role=dialog aria-modal`；打开后焦点移入面板（优先首个可聚焦元素）
 * - **焦点陷阱**：Tab/Shift+Tab 在面板内循环，不逃逸到背景
 * - Esc 触发 onClose；关闭后焦点还原到打开前的元素
 * - 遮罩点击不关闭（防误触；仅由显式取消/确认按钮关闭）
 *
 * `open` 支持 `boolean` 或响应式 `Accessor<boolean>`。
 */
import { createEffect, onCleanup } from "solid-js";
import type { Accessor, JSX } from "solid-js";
import { YoPresence } from "../motion/presence";
import "./Dialog.css";

export interface YoDialogProps {
  /** 是否打开（布尔值或响应式访问器） */
  open: boolean | Accessor<boolean>;
  /** 标题 */
  title?: string;
  /** 面板宽度（px），默认 560 */
  width?: number;
  /** 面板高度（px）；不设则随内容，受 max-height 约束 */
  height?: number;
  /** 关闭回调（Esc 触发） */
  onClose: () => void;
  /** 底部按钮区 */
  footer?: JSX.Element;
  children: JSX.Element;
}

/** 可参与 Tab 序的元素。 */
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function focusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
  );
}

/**
 * 渲染一个带遮罩的模态对话框。
 */
export function YoDialog(props: YoDialogProps): JSX.Element {
  const isOpen = (): boolean => (typeof props.open === "function" ? props.open() : props.open);

  let panel: HTMLDivElement | undefined;
  let restoreFocus: HTMLElement | null = null;

  createEffect(() => {
    if (!isOpen()) return;

    // 记录打开前焦点（关闭后还原）
    restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        props.onClose();
        return;
      }
      // 焦点陷阱：Tab 在面板内循环
      if (event.key === "Tab" && panel) {
        const items = focusables(panel);
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        const active = document.activeElement;
        if (event.shiftKey) {
          if (active === first || !panel.contains(active)) {
            event.preventDefault();
            last.focus();
          }
        } else if (active === last || !panel.contains(active)) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    // 打开后聚焦面板内首个可聚焦元素
    queueMicrotask(() => {
      if (panel) {
        const items = focusables(panel);
        (items[0] ?? panel).focus();
      }
    });

    onCleanup(() => {
      document.removeEventListener("keydown", handleKeyDown);
      // 焦点还原
      if (restoreFocus) {
        queueMicrotask(() => restoreFocus?.focus());
      }
    });
  });

  return (
    <YoPresence when={isOpen()} recipe="dialog">
      <div class="yohu-dialog">
        <div class="yohu-dialog__backdrop" aria-hidden="true" />
        <div
          class="yohu-dialog__panel"
          role="dialog"
          aria-modal="true"
          aria-label={props.title}
          tabindex={-1}
          ref={(el) => {
            panel = el;
          }}
          style={{
            width: `${props.width ?? 560}px`,
            height: props.height !== undefined ? `${props.height}px` : undefined,
          }}
        >
          {props.title ? <h3 class="yohu-dialog__title">{props.title}</h3> : null}
          <div class="yohu-dialog__body">{props.children}</div>
          {props.footer ? <div class="yohu-dialog__footer">{props.footer}</div> : null}
        </div>
      </div>
    </YoPresence>
  );
}
