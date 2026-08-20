import { describe, expect, it } from "vitest";

import { EMPTY_INDICATOR, indicatorDurationName, indicatorReady, measureIndicator } from "./indicator-layout";

function rect(left: number, top: number, width: number, height: number): DOMRectReadOnly {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

describe("indicator-layout", () => {
  it("选择块相对 track 原点", () => {
    const box = measureIndicator(rect(100, 40, 200, 32), rect(164, 44, 68, 24));
    expect(box).toEqual({ x: 64, y: 4, width: 68, height: 24 });
    expect(indicatorReady(box)).toBe(true);
  });

  it("滚动容器把可视距折成内容坐标", () => {
    const box = measureIndicator(rect(0, 80, 240, 120), rect(8, 40, 224, 32), { left: 0, top: 64 });
    expect(box).toEqual({ x: 8, y: 24, width: 224, height: 32 });
  });

  it("空盒未就绪，避免首帧闪缩", () => {
    expect(indicatorReady(EMPTY_INDICATOR)).toBe(false);
  });

  it("按行程挑时长档：短跳 fast、邻项 small、跨栏 local", () => {
    const origin = { x: 0, y: 0, width: 80, height: 32 };
    expect(indicatorDurationName(origin, { ...origin, y: 24 })).toBe("fast");
    expect(indicatorDurationName(origin, { ...origin, y: 32 })).toBe("small");
    expect(indicatorDurationName(origin, { ...origin, y: 96 })).toBe("small");
    expect(indicatorDurationName(origin, { ...origin, y: 128 })).toBe("local");
  });
});
