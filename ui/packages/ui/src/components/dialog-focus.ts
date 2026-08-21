/**
 * 对话框焦点陷阱（L2）。视图只接线。
 */

export const DIALOG_FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function dialogFocusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE)).filter(
    (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
  );
}

/** Tab 循环目标；返回 null 表示交给浏览器默认前进。 */
export function dialogTabTarget(
  items: readonly HTMLElement[],
  panel: HTMLElement,
  active: Element | null,
  shift: boolean,
): HTMLElement | null {
  if (items.length === 0) return null;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const inside = active instanceof Node && panel.contains(active);
  if (shift) {
    return active === first || !inside ? last : null;
  }
  return active === last || !inside ? first : null;
}
