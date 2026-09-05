import { describe, expect, it, vi } from "vitest";

vi.mock("@yohu/api", () => ({
  MIRROR_MIN_LAYOUT_PX: 64,
}));

import { MIRROR_MIN_LAYOUT_PX } from "@yohu/api";

import { clientZoneRect, layoutIsPresentable } from "./layout";

describe("clientZoneRect", () => {
  it("把 CSS 盒乘 DPR，不加屏幕原点", () => {
    expect(clientZoneRect({ left: 10, top: 20, width: 100, height: 200 }, 1.5)).toEqual({
      x: Math.round(10 * 1.5),
      y: Math.round(20 * 1.5),
      width: Math.round(100 * 1.5),
      height: Math.round(200 * 1.5),
    });
  });

  it("DPR 非法时按 1，零盒保持 0", () => {
    expect(clientZoneRect({ left: 0, top: 0, width: 0, height: 0 }, 0)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });

  it("把 visualViewport 偏移加进客户区原点", () => {
    expect(
      clientZoneRect({ left: 10, top: 20, width: 100, height: 200 }, 2, {
        left: 5,
        top: 6,
      }),
    ).toEqual({
      x: Math.round((10 + 5) * 2),
      y: Math.round((20 + 6) * 2),
      width: 200,
      height: 400,
    });
  });
});

describe("layoutIsPresentable", () => {
  it("与 protocol MIRROR_MIN_LAYOUT_PX 对齐", () => {
    expect(MIRROR_MIN_LAYOUT_PX).toBe(64);
    expect(layoutIsPresentable(486, 1)).toBe(false);
    expect(layoutIsPresentable(MIRROR_MIN_LAYOUT_PX, MIRROR_MIN_LAYOUT_PX)).toBe(true);
  });
});
