import { describe, expect, it } from "vitest";

import { placePopover } from "./popover-place";

const VIEW = { width: 800, height: 600 };
const GAP = 8;
const CAP = 240;

describe("placePopover", () => {
  it("下方空间足够时向下展开", () => {
    const box = placePopover({
      trigger: { top: 40, left: 100, bottom: 72, width: 120 },
      menuHeight: 96,
      viewport: VIEW,
      gap: GAP,
      maxHeightCap: CAP,
    });
    expect(box.placement).toBe("bottom");
    expect(box.top).toBe(80);
    expect(box.bottom).toBeNull();
    expect(box.left).toBe(100);
    expect(box.width).toBe(120);
    expect(box.maxHeight).toBe(CAP);
  });

  it("下方放不下完整菜单且上方更充裕时向上展开", () => {
    const box = placePopover({
      trigger: { top: 540, left: 20, bottom: 572, width: 160 },
      menuHeight: 120,
      viewport: VIEW,
      gap: GAP,
      maxHeightCap: CAP,
    });
    expect(box.placement).toBe("top");
    expect(box.top).toBeNull();
    expect(box.bottom).toBe(600 - 540 + GAP);
    expect(box.maxHeight).toBe(Math.min(CAP, 540 - GAP));
  });

  it("贴视口底、下方几乎为 0 时必须向上，不能往下撑", () => {
    const box = placePopover({
      trigger: { top: 560, left: 40, bottom: 592, width: 140 },
      menuHeight: 104,
      viewport: VIEW,
      gap: GAP,
      maxHeightCap: CAP,
    });
    expect(box.placement).toBe("top");
    expect(box.top).toBeNull();
    expect(box.bottom).toBeGreaterThan(0);
    expect(box.maxHeight).toBeLessThanOrEqual(560 - GAP);
  });

  it("两侧都不够时选空间更大的一侧并裁切高度", () => {
    const box = placePopover({
      trigger: { top: 40, left: 0, bottom: 72, width: 80 },
      menuHeight: 400,
      viewport: { width: 400, height: 200 },
      gap: GAP,
      maxHeightCap: CAP,
    });
    expect(box.placement).toBe("bottom");
    expect(box.maxHeight).toBe(200 - 72 - GAP);
  });

  it("高度被低估为 0 时仍比较两侧空间，贴底则向上", () => {
    const box = placePopover({
      trigger: { top: 540, left: 20, bottom: 572, width: 160 },
      menuHeight: 0,
      viewport: VIEW,
      gap: GAP,
      maxHeightCap: CAP,
    });
    expect(box.placement).toBe("top");
  });

  it("右侧溢出时把菜单夹进视口", () => {
    const box = placePopover({
      trigger: { top: 10, left: 750, bottom: 42, width: 120 },
      menuHeight: 40,
      viewport: VIEW,
      gap: GAP,
      maxHeightCap: CAP,
    });
    expect(box.left).toBe(800 - 120);
  });
});
