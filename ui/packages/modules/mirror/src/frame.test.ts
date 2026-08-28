import { describe, expect, it } from "vitest";

import { fitContain } from "./fit";
import { frameStyle, isFrameMode } from "./frame";

describe("isFrameMode", () => {
  it("live 为 true", () => {
    expect(isFrameMode("live")).toBe(true);
  });

  it("idle 为 false", () => {
    expect(isFrameMode("idle")).toBe(false);
  });
});

describe("frameStyle", () => {
  it("zone 非法（0）时返回空串（回退 100%）", () => {
    expect(frameStyle(0, 200, 1080, 2400, "live")).toBe("");
    expect(frameStyle(100, 0, 1080, 2400, "live")).toBe("");
    expect(frameStyle(0, 0, 1080, 2400, "live")).toBe("");
  });

  it("idle / 尺寸未知时撑满内容区", () => {
    expect(frameStyle(100, 200, 0, 0, "idle")).toBe("--mirror-w:100px; --mirror-h:200px;");
    expect(frameStyle(100, 200, 1080, 2400, "idle")).toBe("--mirror-w:100px; --mirror-h:200px;");
  });

  it("live 且分辨率已知时按 fitContain 等比贴合", () => {
    const box = fitContain(1000, 600, 1080 / 2400);
    expect(frameStyle(1000, 600, 1080, 2400, "live")).toBe(`--mirror-w:${box.w}px; --mirror-h:${box.h}px;`);
  });
});
