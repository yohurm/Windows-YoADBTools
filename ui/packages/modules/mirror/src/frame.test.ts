import { describe, expect, it } from "vitest";

import { fitContain } from "./fit";
import { frameStyle } from "./frame";

describe("frameStyle", () => {
  it("非 live（空闲/未启动/失败）→ 空串，面板回退 100% 撑满内容区", () => {
    expect(frameStyle(100, 200, 0, 0, "idle")).toBe("");
    expect(frameStyle(100, 200, 1080, 2400, "idle")).toBe("");
    expect(frameStyle(100, 200, 1080, 2400, "starting")).toBe("");
    expect(frameStyle(100, 200, 1080, 2400, "failed")).toBe("");
  });

  it("live 但分辨率未知 → 空串", () => {
    expect(frameStyle(100, 200, 0, 0, "live")).toBe("");
  });

  it("live 但可用区不可测（<1）→ 空串", () => {
    expect(frameStyle(0, 200, 1080, 2400, "live")).toBe("");
    expect(frameStyle(100, 0, 1080, 2400, "live")).toBe("");
  });

  it("live 且分辨率/可用区均已知 → 按设备宽高比 contain 贴合", () => {
    const box = fitContain(1000, 600, 1080 / 2400);
    expect(frameStyle(1000, 600, 1080, 2400, "live")).toBe(`--mirror-w:${box.w}px; --mirror-h:${box.h}px;`);
  });
});
