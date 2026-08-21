import { describe, expect, it, vi } from "vitest";

import type { CommandDto, CommandGroupDto } from "@yohu/api";

const mocks = vi.hoisted(() => ({
  terminalEval: vi.fn(),
  groupRun: vi.fn(),
  groupCancel: vi.fn(),
}));

vi.mock("@yohu/api", async () => {
  const actual = await vi.importActual<typeof import("@yohu/api")>("@yohu/api");
  return {
    ...actual,
    commandlibLoad: vi.fn(),
    commandlibSave: vi.fn(),
    groupRun: (...a: unknown[]) => mocks.groupRun(...a),
    groupCancel: (...a: unknown[]) => mocks.groupCancel(...a),
    onGroupProgress: vi.fn(() => undefined),
    terminalEval: (...a: unknown[]) => mocks.terminalEval(...a),
  };
});

import { createTerminalStore } from "./store";

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

describe("runCommand / runGroup 目标设备", () => {
  it("一次 IPC 带全部 serials，由 core 填充", async () => {
    mocks.terminalEval.mockResolvedValue([
      { serial: "A1", ok: true, message: "", stdout: "ok", duration_ms: 1, exit_code: 0, stderr: "" },
    ]);
    const store = createTerminalStore();
    await store.runCommand(["A1"], COMMAND, ["hi"]);
    expect(mocks.terminalEval).toHaveBeenCalledTimes(1);
    expect(mocks.terminalEval).toHaveBeenCalledWith({
      command_id: "c1",
      values: ["hi"],
      serials: ["A1"],
    });
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
    mocks.groupRun.mockResolvedValue(7);
    const store = createTerminalStore();
    await store.runGroup(["B2"], GROUP);
    expect(mocks.groupRun).toHaveBeenCalledWith({ group_id: "g1", serials: ["B2"] });
  });

  it("含占位符的组不调用 IPC，提示逐条执行", async () => {
    mocks.groupRun.mockClear();
    const store = createTerminalStore();
    await store.runGroup(["B2"], {
      ...GROUP,
      commands: [{ ...COMMAND, inputs: [{ placeholder: "host" }] }],
    });
    expect(mocks.groupRun).not.toHaveBeenCalled();
    expect(store.results.some((r) => r.message.includes("请逐条执行"))).toBe(true);
  });

  it("cancelGroup 把 run_id 交给 groupCancel", async () => {
    mocks.groupRun.mockResolvedValue(9);
    mocks.groupCancel.mockResolvedValue(undefined);
    const store = createTerminalStore();
    await store.runGroup(["B2"], GROUP);
    await store.cancelGroup();
    expect(mocks.groupCancel).toHaveBeenCalledWith(9);
  });

  it("clearResults 清空执行结果面板", async () => {
    const store = createTerminalStore();
    await store.runCommand([], COMMAND, []);
    expect(store.results.length).toBeGreaterThan(0);
    store.clearResults();
    expect(store.results).toEqual([]);
  });
});
