import { describe, expect, it } from "vitest";
import { EMPTY_THUMB, measureThumb, thumbReady } from "./segmented-layout";

describe("segmented-layout", () => {
  it("选择块相对 track 原点", () => {
    const box = measureThumb(
      { left: 100, top: 40, width: 200, height: 32, right: 300, bottom: 72, x: 100, y: 40, toJSON: () => ({}) },
      { left: 164, top: 44, width: 68, height: 24, right: 232, bottom: 68, x: 164, y: 44, toJSON: () => ({}) },
    );
    expect(box).toEqual({ x: 64, y: 4, width: 68, height: 24 });
    expect(thumbReady(box)).toBe(true);
  });

  it("空盒未就绪，避免首帧闪缩", () => {
    expect(thumbReady(EMPTY_THUMB)).toBe(false);
  });
});
