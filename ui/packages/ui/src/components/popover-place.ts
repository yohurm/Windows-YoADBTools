/**
 * 浮层自适应定位：完整放下优先；否则选空间更大的一侧并限制在视口内。
 * 禁止用 0 高度判断（会把「下方永远放得下」），调用方应传入估算高度。
 */

export type PopoverPlacement = "bottom" | "top";

export interface PlacePopoverInput {
  trigger: { top: number; left: number; bottom: number; width: number };
  /** 菜单内容高度（未裁切）；应 ≥ 选项估算，禁止传 0 */
  menuHeight: number;
  viewport: { width: number; height: number };
  gap: number;
  maxHeightCap: number;
}

export interface PlacePopoverResult {
  placement: PopoverPlacement;
  top: number | null;
  bottom: number | null;
  left: number;
  width: number;
  maxHeight: number;
}

/** 读取用于定位的视口（优先 visualViewport，避免 innerHeight 含不可见区）。 */
export function readViewport(): { width: number; height: number } {
  const vv = window.visualViewport;
  if (vv && vv.width > 0 && vv.height > 0) {
    return { width: vv.width, height: vv.height };
  }
  const doc = document.documentElement;
  return {
    width: doc.clientWidth || window.innerWidth || 0,
    height: doc.clientHeight || window.innerHeight || 0,
  };
}

/** 按视口剩余空间决定上下展开；选中侧把高度夹进视口，绝不撑出页面。 */
export function placePopover(input: PlacePopoverInput): PlacePopoverResult {
  const { trigger, viewport, gap, maxHeightCap } = input;
  const desired = Math.min(maxHeightCap, Math.max(0, input.menuHeight));
  const spaceBelow = Math.max(0, viewport.height - trigger.bottom - gap);
  const spaceAbove = Math.max(0, trigger.top - gap);

  let placement: PopoverPlacement;
  if (desired <= 0) {
    placement = spaceBelow >= spaceAbove ? "bottom" : "top";
  } else if (spaceBelow >= desired) {
    placement = "bottom";
  } else if (spaceAbove >= desired || spaceAbove > spaceBelow) {
    placement = "top";
  } else {
    placement = "bottom";
  }

  const available = placement === "bottom" ? spaceBelow : spaceAbove;
  const maxHeight = Math.max(0, Math.min(maxHeightCap, available));
  const width = Math.max(0, trigger.width);
  const left = Math.min(Math.max(0, trigger.left), Math.max(0, viewport.width - width));

  if (placement === "bottom") {
    return { placement, top: trigger.bottom + gap, bottom: null, left, width, maxHeight };
  }
  return {
    placement,
    top: null,
    bottom: Math.max(0, viewport.height - trigger.top + gap),
    left,
    width,
    maxHeight,
  };
}
