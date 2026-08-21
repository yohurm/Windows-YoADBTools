import { describe, expect, it } from "vitest";

import { closeFocusIndex, tabsKeyIntent } from "./tabs-model";

describe("tabs-model", () => {
  it("左右循环、Home/End", () => {
    expect(tabsKeyIntent("ArrowRight", 0, 3, false)).toEqual({ type: "activate", index: 1 });
    expect(tabsKeyIntent("ArrowLeft", 0, 3, false)).toEqual({ type: "activate", index: 2 });
    expect(tabsKeyIntent("Home", 2, 3, false)).toEqual({ type: "activate", index: 0 });
    expect(tabsKeyIntent("End", 0, 3, false)).toEqual({ type: "activate", index: 2 });
  });

  it("无激活项时箭头从 0 起算", () => {
    expect(tabsKeyIntent("ArrowRight", -1, 3, false)).toEqual({ type: "activate", index: 1 });
  });

  it("Delete 仅在可关闭且有激活项时关闭", () => {
    expect(tabsKeyIntent("Delete", 1, 3, true)).toEqual({ type: "close", index: 1 });
    expect(tabsKeyIntent("Delete", 1, 3, false)).toBeNull();
    expect(tabsKeyIntent("Delete", -1, 3, true)).toBeNull();
  });

  it("关闭后焦点落到相邻", () => {
    expect(closeFocusIndex(0, 3)).toBe(0);
    expect(closeFocusIndex(2, 3)).toBe(1);
    expect(closeFocusIndex(1, 2)).toBe(0);
  });
});
