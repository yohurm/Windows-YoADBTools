import { describe, expect, it } from "vitest";

import { fpsWindow } from "./fps";

describe("fpsWindow", () => {
  it("零时长为 0", () => {
    expect(fpsWindow(12, 0)).toBe(0);
    expect(fpsWindow(12, -1)).toBe(0);
  });

  it("跨秒聚合", () => {
    expect(fpsWindow(60, 1000)).toBe(60);
    expect(fpsWindow(90, 2000)).toBe(45);
    expect(fpsWindow(0, 1000)).toBe(0);
  });

  it("暂停窗口计数为 0 时读数为 0（由调用方冻结上次值）", () => {
    expect(fpsWindow(0, 1000)).toBe(0);
  });
});
