import { describe, expect, it } from "vitest";
import {
  YO_SEGMENTED_MAX_ITEMS,
  edgeEnabledIndex,
  enabledItemIndexes,
  isHybridItems,
  resolveKeyIndex,
  resolveSelectedIndex,
  segmentKeyIntent,
  stepEnabledIndex,
} from "./segmented-model";

const ITEMS = [
  { value: "package" },
  { value: "pid" },
  { value: "all", disabled: true },
  { value: "tag" },
];

describe("segmented-model", () => {
  it("大屏上限是 7（鸿蒙更大屏幕）", () => {
    expect(YO_SEGMENTED_MAX_ITEMS).toBe(7);
  });

  it("仅有图标或仅有文本不是 hybrid", () => {
    expect(isHybridItems([{ value: "a", label: "包名" }])).toBe(false);
    expect(isHybridItems([{ value: "a", icon: "search" }])).toBe(false);
    expect(isHybridItems([{ value: "a", label: "包名", icon: "search" }])).toBe(true);
  });

  it("未知 value 回退到 0，不抛", () => {
    expect(resolveSelectedIndex(ITEMS, "missing")).toBe(0);
    expect(resolveSelectedIndex(ITEMS, "pid")).toBe(1);
  });

  it("enabled 跳过 disabled", () => {
    expect(enabledItemIndexes(ITEMS)).toEqual([0, 1, 3]);
  });

  it("步进循环且跳过禁用项", () => {
    const enabled = enabledItemIndexes(ITEMS);
    expect(stepEnabledIndex(enabled, 1, 1)).toBe(3);
    expect(stepEnabledIndex(enabled, 3, 1)).toBe(0);
    expect(stepEnabledIndex(enabled, 0, -1)).toBe(3);
  });

  it("Home/End 落在可用首尾", () => {
    const enabled = enabledItemIndexes(ITEMS);
    expect(edgeEnabledIndex(enabled, "start")).toBe(0);
    expect(edgeEnabledIndex(enabled, "end")).toBe(3);
  });

  it("方向键映射鸿蒙/ARIA 双向", () => {
    expect(segmentKeyIntent("ArrowRight")).toBe("next");
    expect(segmentKeyIntent("ArrowDown")).toBe("next");
    expect(segmentKeyIntent("ArrowLeft")).toBe("prev");
    expect(segmentKeyIntent("Home")).toBe("start");
    expect(segmentKeyIntent("a")).toBeNull();
  });

  it("resolveKeyIndex 组合选中与按键", () => {
    expect(resolveKeyIndex(ITEMS, "package", "ArrowRight")).toBe(1);
    expect(resolveKeyIndex(ITEMS, "pid", "ArrowRight")).toBe(3);
    expect(resolveKeyIndex(ITEMS, "tag", "Home")).toBe(0);
    expect(resolveKeyIndex(ITEMS, "package", "Enter")).toBeUndefined();
  });
});
