import { describe, expect, it } from "vitest";

import {
  clientZoneRect,
  containInZone,
  layoutIsPresentable,
  physicalCornerRadius,
  zoneInsetKey,
} from "./layout";

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

describe("zoneInsetKey", () => {
  it("窗口变大但 insets 不变则键相同", () => {
    const zone = { x: 232, y: 80, width: 400, height: 600 };
    expect(zoneInsetKey(zone, 900, 800, true, 16)).toBe(
      zoneInsetKey({ ...zone, width: 500, height: 700 }, 1000, 900, true, 16),
    );
  });

  it("铬层 insets 变了则键不同", () => {
    const zone = { x: 232, y: 80, width: 400, height: 600 };
    expect(zoneInsetKey(zone, 900, 800, true, 16)).not.toBe(
      zoneInsetKey({ ...zone, x: 0 }, 900, 800, true, 16),
    );
  });
});

describe("layoutIsPresentable", () => {
  it("拒绝 1px 高的退化盒", () => {
    expect(layoutIsPresentable(486, 1)).toBe(false);
    expect(layoutIsPresentable(64, 64)).toBe(true);
  });
});

describe("containInZone", () => {
  it("无画面尺寸时退回整区", () => {
    const zone = { left: 10, top: 20, width: 900, height: 950 };
    expect(containInZone(zone, 0, 0)).toEqual(zone);
  });

  it("按画面宽高比 contain 并在可用区居中", () => {
    const zone = { left: 100, top: 200, width: 900, height: 950 };
    const box = containInZone(zone, 1088, 2400);
    expect(box.height).toBe(950);
    expect(box.width).toBeLessThan(900);
    expect(box.left).toBeGreaterThan(zone.left);
    expect(box.top).toBe(zone.top);
  });
});

describe("physicalCornerRadius", () => {
  it("把 CSS 圆角乘 DPR", () => {
    expect(physicalCornerRadius(15, 1.5)).toBe(23);
    expect(physicalCornerRadius(16, 1)).toBe(16);
  });

  it("0 或非法 DPR 不裁圆角", () => {
    expect(physicalCornerRadius(0, 2)).toBe(0);
    expect(physicalCornerRadius(16, 0)).toBe(16);
  });
});
