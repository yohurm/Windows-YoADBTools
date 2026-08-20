import { describe, expect, it, vi } from "vitest";

import type { CommandDto, CommandGroupDto } from "@yohu/api";

const mocks = vi.hoisted(() => ({
  terminalEval: vi.fn(),
  groupRun: vi.fn(),
}));

vi.mock("@yohu/api", () => ({
  commandlibLoad: vi.fn(),
  commandlibSave: vi.fn(),
  groupRun: (...a: unknown[]) => mocks.groupRun(...a),
  onGroupProgress: vi.fn(() => undefined),
  terminalEval: (...a: unknown[]) => mocks.terminalEval(...a),
}));

import { createTerminalStore, fillPlaceholders } from "./store";

const COMMAND: CommandDto = {
  id: "c1",
  name: "echo",
  template: "echo {0}",
  inputs: [],
  failure_regex: "",
  success_regex: "",
  delay_ms: 0,
  abort_on_fail: false,
};

const GROUP: CommandGroupDto = {
  id: "g1",
  name: "demo",
  tags: [],
  commands: [COMMAND],
};

describe("fillPlaceholders", () => {
  it("按索引替换", () => {
    expect(fillPlaceholders("ping -c 3 {0}", ["8.8.8.8"])).toBe("ping -c 3 8.8.8.8");
  });

  it("多个占位符顺序替换", () => {
    expect(fillPlaceholders("{0} {1} {0}", ["a", "b"])).toBe("a b a");
  });

  it("无占位符原样返回", () => {
    expect(fillPlaceholders("getprop ro.build.version", [])).toBe("getprop ro.build.version");
  });
});

describe("runCommand / runGroup 目标设备", () => {
  it("只向传入的 serials 发命令，不补全其他设备", async () => {
    mocks.terminalEval.mockResolvedValue({ ok: true, message: "", stdout: "ok", duration_ms: 1 });
    const store = createTerminalStore();
    await store.runCommand(["A1"], COMMAND, ["hi"]);
    expect(mocks.terminalEval).toHaveBeenCalledTimes(1);
    expect(mocks.terminalEval).toHaveBeenCalledWith(
      "A1",
      expect.objectContaining({ template: "echo hi" }),
    );
  });

  it("空目标不调用 IPC", async () => {
    mocks.terminalEval.mockClear();
    mocks.groupRun.mockClear();
    const store = createTerminalStore();
    await store.runCommand([], COMMAND, []);
    await store.runGroup([], GROUP);
    expect(mocks.terminalEval).not.toHaveBeenCalled();
    expect(mocks.groupRun).not.toHaveBeenCalled();
    expect(store.results.some((r) => r.message === "未选择在线设备")).toBe(true);
  });

  it("命令组把传入 serials 原样交给 groupRun", async () => {
    mocks.groupRun.mockResolvedValue(undefined);
    const store = createTerminalStore();
    await store.runGroup(["B2"], GROUP);
    expect(mocks.groupRun).toHaveBeenCalledWith({ group_id: "g1", serials: ["B2"] });
  });

  it("clearResults 清空执行结果面板", async () => {
    const store = createTerminalStore();
    await store.runCommand([], COMMAND, []);
    expect(store.results.length).toBeGreaterThan(0);
    store.clearResults();
    expect(store.results).toEqual([]);
  });
});
