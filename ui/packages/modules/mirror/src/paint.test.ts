import { describe, expect, it } from "vitest";

import { backingStoreSize, isDownscale, nearestNeighborScale } from "./paint";

describe("paint geometry", () => {
  it("backingStoreSize 对齐 CSS × DPR", () => {
    expect(backingStoreSize(200, 100, 2)).toEqual({ width: 400, height: 200 });
    expect(backingStoreSize(0, 0, 2)).toEqual({ width: 1, height: 1 });
    expect(backingStoreSize(100, 50, 0)).toEqual({ width: 100, height: 50 });
  });

  it("nearestNeighborScale 仅整数倍放大", () => {
    expect(nearestNeighborScale(2160, 3840, 1080, 1920)).toBe(true);
    expect(nearestNeighborScale(1080, 1920, 1080, 1920)).toBe(true);
    expect(nearestNeighborScale(800, 1422, 1080, 1920)).toBe(false);
    expect(nearestNeighborScale(1620, 2880, 1080, 1920)).toBe(false);
  });

  it("isDownscale 在小于视频时为真", () => {
    expect(isDownscale(540, 960, 1080, 1920)).toBe(true);
    expect(isDownscale(1080, 1920, 1080, 1920)).toBe(false);
  });
});
