/**
 * 对话框单栈焦点管理器（L2，修正审查 F3a/b）。
 *
 * 原实现每个 YoDialog 各挂一个 `document` keydown：两个 Dialog 同时打开时，
 * 两个监听共存 → Esc 会同时关两层面板，Tab 会在两个面板间抢焦点（后开者被
 * 旧面板拉回）。这里改成**模块级 LIFO 栈 + 全局唯一 keydown 监听**：
 *
 * - 只有栈顶 Dialog 响应 Esc / Tab（Esc 只关最上层；Tab 只在最上层内循环）。
 * - 栈从空 → 1 时挂一次 document 监听，1 → 空时摘除，避免跨实例/跨测试泄漏。
 * - 关闭还原：最外层（栈空）还原到「打开它之前的元素」；若下层 Dialog 仍在，
 *   焦点落回新的栈顶（优先还原到打开最上层之前的元素，若它已在下层内）。
 *
 * 视图（YoDialog）只负责 push / pop，不自己挂 keydown。
 */
import { dialogFocusables, dialogTabTarget } from "./dialog-focus";

export interface DialogStackEntry {
  /** 面板元素取用器（panel 在 ref 回调后才赋值，取用器保持惰性）。 */
  getPanel: () => HTMLElement | undefined;
  /** 关闭回调（Esc 触发）。 */
  onClose: () => void;
  /** 打开该 Dialog 前的焦点；栈为空时用它还原。 */
  restoreFocus: HTMLElement | null;
}

const stack: DialogStackEntry[] = [];

function focusInto(panel: HTMLElement | undefined): void {
  if (!panel) return;
  const items = dialogFocusables(panel);
  (items[0] ?? panel).focus();
}

/** 全局唯一 keydown：只处理栈顶（最上层）Dialog。 */
function handleKeyDown(event: KeyboardEvent): void {
  const top = stack[stack.length - 1];
  if (!top) return;

  if (event.key === "Escape") {
    top.onClose();
    return;
  }

  if (event.key === "Tab") {
    const panel = top.getPanel();
    if (!panel) return;
    const items = dialogFocusables(panel);
    const target = dialogTabTarget(items, panel, document.activeElement, event.shiftKey);
    if (target) {
      event.preventDefault();
      target.focus();
    }
  }
}

export function pushDialog(entry: DialogStackEntry): void {
  // 防御：同一面板被重复登记（响应式重跑）时替换旧条目，避免栈内重复。
  const dup = stack.findIndex((e) => e.getPanel() === entry.getPanel());
  if (dup >= 0) stack.splice(dup, 1);
  stack.push(entry);
  if (stack.length === 1) {
    document.addEventListener("keydown", handleKeyDown);
  }
}

export function popDialog(entry: DialogStackEntry): void {
  const idx = stack.indexOf(entry);
  if (idx < 0) return; // 已被弹出（防御）。

  stack.splice(idx, 1);

  if (stack.length === 0) {
    document.removeEventListener("keydown", handleKeyDown);
    // 最外层关闭：还原到打开它之前的焦点。
    const target = entry.restoreFocus;
    if (target) queueMicrotask(() => target.focus());
    return;
  }

  // 下层 Dialog 仍开着：焦点落回新的最上层，避免跑到被遮住的背景。
  const newTop = stack[stack.length - 1];
  if (!newTop) return;
  const panel = newTop.getPanel();
  const restoreInside = Boolean(entry.restoreFocus && panel && panel.contains(entry.restoreFocus));
  queueMicrotask(() => {
    if (restoreInside && entry.restoreFocus) {
      entry.restoreFocus.focus();
    } else {
      focusInto(panel);
    }
  });
}
