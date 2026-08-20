import { describe, expect, it } from "vitest";

import { clampContextMenuPoint, estimateContextMenuHeight } from "./place";

describe("clampContextMenuPoint", () => {
  it("贴右下角时夹进视口", () => {
    const point = clampContextMenuPoint(2000, 2000, 4, { width: 800, height: 600 });
    expect(point.x).toBeLessThanOrEqual(800 - 224);
    expect(point.y).toBeLessThan(600);
    expect(point.x).toBeGreaterThanOrEqual(0);
    expect(point.y).toBeGreaterThanOrEqual(0);
  });

  it("视口内原坐标保持", () => {
    expect(clampContextMenuPoint(40, 80, 2, { width: 800, height: 600 })).toEqual({ x: 40, y: 80 });
  });

  it("高度随条目增加", () => {
    expect(estimateContextMenuHeight(3)).toBeGreaterThan(estimateContextMenuHeight(1));
  });
});
