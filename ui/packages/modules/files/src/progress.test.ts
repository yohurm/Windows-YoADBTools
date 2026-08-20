import { describe, expect, it } from "vitest";

import { isTerminalTransfer, shouldAcceptProgress } from "./progress";

describe("shouldAcceptProgress", () => {
  it("无现态时接受 running / 终态", () => {
    expect(shouldAcceptProgress(undefined, "running")).toBe(true);
    expect(shouldAcceptProgress(undefined, "done")).toBe(true);
    expect(shouldAcceptProgress(undefined, "failed")).toBe(true);
  });

  it("running 可被进度或终态更新", () => {
    expect(shouldAcceptProgress("running", "running")).toBe(true);
    expect(shouldAcceptProgress("running", "done")).toBe(true);
    expect(shouldAcceptProgress("running", "cancelled")).toBe(true);
    expect(shouldAcceptProgress("running", "failed")).toBe(true);
  });

  it("终态之后拒绝迟到的 running（钉死传输卡的根因）", () => {
    expect(shouldAcceptProgress("done", "running")).toBe(false);
    expect(shouldAcceptProgress("failed", "running")).toBe(false);
    expect(shouldAcceptProgress("cancelled", "running")).toBe(false);
  });

  it("终态可被同卡后续终态覆盖（取消后失败事件）", () => {
    expect(shouldAcceptProgress("done", "failed")).toBe(true);
    expect(shouldAcceptProgress("cancelled", "cancelled")).toBe(true);
  });
});

describe("isTerminalTransfer", () => {
  it("仅 running 非终态", () => {
    expect(isTerminalTransfer("running")).toBe(false);
    expect(isTerminalTransfer("done")).toBe(true);
  });
});
