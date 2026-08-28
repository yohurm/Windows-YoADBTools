/**
 * 事件订阅封装单测：核心断言是「订阅失败必须对调用方可感知」。
 *
 * - 成功：`onXxx` resolve 出可调用的 unlisten。
 * - 重试耗尽：`onXxx` reject（抛错）而非 resolve 一个吞掉故障的 noop —— 那会掩盖 IPC/ACL 失败。
 *
 * 依赖 jsdom + fake timers 驱动 40×250ms 退避；用 `vi.mocked(listen)` 控制 `listen` 的成败。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listen } from "@tauri-apps/api/event";

import { onDevicesChanged } from "./events";

// 覆盖 test-setup 的 listen stub：此处用 vi.fn 以便按测试控制成败。
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(listen).mockReset();
  vi.mocked(listen).mockImplementation(() => Promise.resolve(() => undefined));
});

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(listen).mockClear();
});

describe("on() 订阅失败语义", () => {
  it("成功路径 resolve 出无副作用 unlisten（至多 attach 一次）", async () => {
    const unlisten = vi.fn(() => undefined);
    vi.mocked(listen).mockResolvedValueOnce(unlisten);

    const p = onDevicesChanged(() => {});
    const got = await p;
    // 成功路径只 attach 一次即返回，不进入退避。
    expect(vi.mocked(listen)).toHaveBeenCalledTimes(1);
    expect(got).toBe(unlisten);
  });

  it("重试耗尽后 reject（而非返回 noop unlisten）", async () => {
    const ipcDown = new Error("ipc down");
    vi.mocked(listen).mockRejectedValue(ipcDown);

    const p = onDevicesChanged(() => {});
    const assertion = expect(p).rejects.toThrow("ipc down");
    await vi.runAllTimersAsync();
    await assertion;

    // 确实经历了多次退避重试后放弃，而非一次就静默。
    expect(vi.mocked(listen).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
