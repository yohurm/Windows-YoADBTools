import { describe, expect, it } from "vitest";

import { clampContextMenuPoint, clampToRect, estimateContextMenuHeight } from "./place";

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

describe("clampToRect", () => {
  it("贴边更宽条目：按实测宽高二次夹紧", () => {
    const point = clampToRect(2000, 2000, { width: 600, height: 300 }, { width: 800, height: 600 });
    expect(point.x).toBe(200); // 800 - 600
    expect(point.y).toBe(300); // 600 - 300
  });

  it("估算被低估时，二次夹紧把 x 收回来不出右缘", () => {
    // 估算只用 MenuMin(224)：clampContextMenuPoint 允许 x ≤ 800-224=576，
    // 但实测宽 600 时 x=576 仍会右溢出 400px；按实测 clampToRect 能收回到 200。
    const est = clampContextMenuPoint(2000, 2000, 4, { width: 800, height: 600 });
    const fixed = clampToRect(est.x, est.y, { width: 600, height: 300 }, { width: 800, height: 600 });
    expect(est.x).toBe(576);
    expect(fixed.x).toBe(200);
    expect(fixed.x + 600).toBeLessThanOrEqual(800);
  });

  it("视口内原坐标保持", () => {
    expect(clampToRect(40, 80, { width: 200, height: 100 }, { width: 800, height: 600 })).toEqual({
      x: 40,
      y: 80,
    });
  });

  it("尺寸大于视口时贴 0（全屏滚动兜底）", () => {
    expect(clampToRect(50, 50, { width: 1200, height: 900 }, { width: 800, height: 600 })).toEqual({
      x: 0,
      y: 0,
    });
  });
});
