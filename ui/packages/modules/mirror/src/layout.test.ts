import { describe, expect, it } from "vitest";

import { physicalPanelRect } from "./layout";

describe("physicalPanelRect", () => {
  it("把 CSS 盒乘 DPR 并加上窗口屏幕原点", () => {
    expect(physicalPanelRect({ left: 10, top: 20, width: 100, height: 200 }, 40, 80, 1.5)).toEqual({
      x: Math.round((40 + 10) * 1.5),
      y: Math.round((80 + 20) * 1.5),
      width: Math.round(100 * 1.5),
      height: Math.round(200 * 1.5),
    });
  });

  it("DPR 非法时按 1，宽度高度至少 1", () => {
    expect(physicalPanelRect({ left: 0, top: 0, width: 0, height: 0 }, 0, 0, 0)).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
  });

  it("把 visualViewport 偏移加进屏幕原点", () => {
    expect(
      physicalPanelRect({ left: 10, top: 20, width: 100, height: 200 }, 40, 80, 2, {
        left: 5,
        top: 6,
      }),
    ).toEqual({
      x: Math.round((40 + 10 + 5) * 2),
      y: Math.round((80 + 20 + 6) * 2),
      width: 200,
      height: 400,
    });
  });
});
