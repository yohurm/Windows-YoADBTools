import { describe, expect, it } from "vitest";

import { edgeIndex, findOption, optionDomId, selectedIndex, selectKeyIntent, stepIndex } from "./select-model";

const OPTIONS = [
  { value: "a", label: "A" },
  { value: "b", label: "B" },
  { value: "", label: "全部" },
];

describe("select-model", () => {
  it("空字符串 value 生成稳定 option id", () => {
    expect(optionDomId("")).toBe("yohu-option-empty");
    expect(optionDomId("a")).toBe("yohu-option-a");
  });

  it("按 value 查找选项", () => {
    expect(findOption(OPTIONS, "b")?.label).toBe("B");
    expect(findOption(OPTIONS, "")?.label).toBe("全部");
    expect(findOption(OPTIONS, "missing")).toBeUndefined();
  });

  it("选中下标；未命中为 -1", () => {
    expect(selectedIndex(OPTIONS, "a")).toBe(0);
    expect(selectedIndex(OPTIONS, "")).toBe(2);
    expect(selectedIndex(OPTIONS, "x")).toBe(-1);
  });

  it("循环步进活动项", () => {
    expect(stepIndex(3, 0, 1)).toBe(1);
    expect(stepIndex(3, 2, 1)).toBe(0);
    expect(stepIndex(3, 0, -1)).toBe(2);
    expect(stepIndex(0, 0, 1)).toBe(-1);
  });

  it("Home/End 落到首尾", () => {
    expect(edgeIndex(3, "start")).toBe(0);
    expect(edgeIndex(3, "end")).toBe(2);
    expect(edgeIndex(0, "end")).toBe(-1);
  });

  it("键盘意图：开合与步进", () => {
    expect(selectKeyIntent("ArrowDown", false)).toEqual({ type: "step", delta: 1 });
    expect(selectKeyIntent("ArrowUp", true)).toEqual({ type: "step", delta: -1 });
    expect(selectKeyIntent("Home", false)).toBeNull();
    expect(selectKeyIntent("Home", true)).toEqual({ type: "edge", edge: "start" });
    expect(selectKeyIntent("End", true)).toEqual({ type: "edge", edge: "end" });
    expect(selectKeyIntent("Enter", false)).toEqual({ type: "toggle" });
    expect(selectKeyIntent(" ", true)).toEqual({ type: "commit" });
    expect(selectKeyIntent("Tab", true)).toEqual({ type: "tabCommit" });
    expect(selectKeyIntent("Tab", false)).toBeNull();
    expect(selectKeyIntent("Escape", true)).toBeNull();
  });
});
