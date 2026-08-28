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
 * 多实例叠加：Esc/Tab 由模块级**单栈焦点管理器**统一裁决，只作用于最上层，
 * 消除两个 Dialog 各自挂 keydown 时的焦点竞争。视图只 push / pop，不挂监听。
 *
 * `open` 支持 `boolean` 或响应式 `Accessor<boolean>`。
 */
import { createEffect, onCleanup } from "solid-js";
import type { Accessor, JSX } from "solid-js";
import { YoPresence } from "../motion/presence";
import { dialogFocusables } from "./dialog-focus";
import { popDialog, pushDialog, type DialogStackEntry } from "./dialog-stack";
import "./Dialog.css";

export interface YoDialogProps {
  /** 是否打开（布尔值或响应式访问器） */
  open: boolean | Accessor<boolean>;
  /** 标题 */
  title?: string;
  /** 面板宽度（px）。不设则走 `--yohu-layout-dialog-max`（弹出框 400）。显式值用于命令管理等整页对话框。 */
  width?: number;
  /** 面板高度（px）；不设则随内容，受 max-height 约束 */
  height?: number;
  /** 关闭回调（Esc 触发） */
  onClose: () => void;
  /** 底部按钮区 */
  footer?: JSX.Element;
  children: JSX.Element;
}

/**
 * 渲染一个带遮罩的模态对话框。
 */
export function YoDialog(props: YoDialogProps): JSX.Element {
  const isOpen = (): boolean => (typeof props.open === "function" ? props.open() : props.open);

  let panel: HTMLDivElement | undefined;

  createEffect(() => {
    if (!isOpen()) return;

    // 记录打开前焦点（关闭时交给单栈焦点管理器还原）
    const restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const entry: DialogStackEntry = {
      getPanel: () => panel,
      onClose: props.onClose,
      restoreFocus,
    };
    pushDialog(entry);

    // 打开后聚焦面板内首个可聚焦元素
    queueMicrotask(() => {
      if (panel) {
        const items = dialogFocusables(panel);
        (items[0] ?? panel).focus();
      }
    });

    onCleanup(() => {
      popDialog(entry);
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
          aria-label={props.title || undefined}
          tabindex={-1}
          ref={(el) => {
            panel = el;
          }}
          classList={{ "yohu-dialog__panel--sized": props.width !== undefined }}
          style={{
            ...(props.width !== undefined ? { width: `${props.width}px` } : {}),
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
