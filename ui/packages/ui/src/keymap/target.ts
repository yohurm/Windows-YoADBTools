/**
 * L0 焦点目标：谁在接收键盘，是不是可编辑 / 可激活控件。
 * 不包含页面选择器、不包含业务动作。
 */

const ACTIONABLE = "button, a, [role='tab'], [role='combobox'], [role='menuitem'], .yohu-select";
const DEFAULT_SHELL = ".yohu-layout__rail, .yohu-titlebar, .yohu-status-bar";

export function elementOf(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement) return target;
  if (target instanceof Node && target.parentElement) return target.parentElement;
  return null;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const el = elementOf(target);
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.closest("input, textarea, select, [contenteditable='true']") !== null;
}

export function isActionableTarget(target: EventTarget | null): boolean {
  const el = elementOf(target);
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "BUTTON" || tag === "A") return true;
  return el.closest(ACTIONABLE) !== null;
}

export function isShellTarget(target: EventTarget | null, shellSelector: string = DEFAULT_SHELL): boolean {
  const el = elementOf(target);
  return el !== null && el.closest(shellSelector) !== null;
}

export function isInside(root: Element | null | undefined, node: EventTarget | null): boolean {
  const el = elementOf(node);
  return Boolean(root && el && root.contains(el));
}
