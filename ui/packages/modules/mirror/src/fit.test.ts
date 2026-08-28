import { describe, expect, it } from "vitest";

import { fitContain } from "./fit";

describe("fitContain", () => {
  it("竖屏：容器更宽时由高度决定，高度占满", () => {
    // 1080×2400 → aspect 0.45；容器 1000×600 宽于比例
    const box = fitContain(1000, 600, 1080 / 2400);
    expect(box).toEqual({ w: 270, h: 600 });
  });

  it("横屏：容器更窄时由宽度决定，宽度占满", () => {
    // 2400×1080 → aspect 2.2222；容器 1000×600 窄于比例
    const box = fitContain(1000, 600, 2400 / 1080);
    expect(box).toEqual({ w: 1000, h: 450 });
  });

  it("恰好等比：宽高同时占满", () => {
    const box = fitContain(800, 450, 16 / 9);
    expect(box).toEqual({ w: 800, h: 450 });
  });

  it("非法输入返回 0", () => {
    expect(fitContain(0, 100, 0.5)).toEqual({ w: 0, h: 0 });
    expect(fitContain(100, -1, 0.5)).toEqual({ w: 0, h: 0 });
    expect(fitContain(100, 100, 0)).toEqual({ w: 0, h: 0 });
    expect(fitContain(100, 100, Number.NaN)).toEqual({ w: 0, h: 0 });
  });

  it("返回宽高按比例，误差不超过 1px", () => {
    const box = fitContain(640, 800, 9 / 20);
    expect(Math.abs(box.w / box.h - 9 / 20)).toBeLessThanOrEqual(0.01);
  });
});
