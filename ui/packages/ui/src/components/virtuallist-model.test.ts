import { describe, expect, it } from "vitest";

import {
  VIRTUAL_STICK_THRESHOLD,
  isStuckToBottom,
  virtualRange,
  virtualTotalHeight,
} from "./virtuallist-model";

describe("virtuallist-model", () => {
  it("总高度 = 行数 × 行高", () => {
    expect(virtualTotalHeight(10, 22)).toBe(220);
  });

  it("窗口含 overscan，夹在 [0, count]", () => {
    expect(virtualRange(0, 100, 20, 50, 2)).toEqual({ start: 0, end: 7 });
    expect(virtualRange(200, 100, 20, 50, 2)).toEqual({ start: 8, end: 17 });
    expect(virtualRange(0, 100, 20, 3, 10)).toEqual({ start: 0, end: 3 });
  });

  it("贴底阈值", () => {
    expect(isStuckToBottom(1000, 200, 800)).toBe(true);
    expect(isStuckToBottom(1000, 200, 800 - VIRTUAL_STICK_THRESHOLD - 1)).toBe(false);
  });
});
