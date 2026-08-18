/**
 * 日志 store 测试：会话生命周期（重命名/复制/关闭其他）+ 批量事件管线
 * （消费端过滤/信号计数/折叠/溢出回补/掉线清缓冲/焦点设备隔离）。
 * @yovo/api 全量 mock；事件订阅处理器以数组捕获，测试取最后一个（对应新建实例）。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LogBatch, LogLine } from "@yovo/api";

const mocks = vi.hoisted(() => ({
  logCaptureStart: vi.fn(),
  logCaptureStop: vi.fn(),
  logClear: vi.fn(),
  logClearDevice: vi.fn(),
  logReplay: vi.fn(),
  logExport: vi.fn(),
  logProcessSnapshot: vi.fn(),
  logBatchHandlers: [] as ((e: { batch: LogBatch }) => void)[],
  logOverflowHandlers: [] as ((e: { serial: string }) => void)[],
  processIndexHandlers: [] as ((e: unknown) => void)[],
  captureStateHandlers: [] as ((e: { serial: string; state: string }) => void)[],
  deviceOfflineHandlers: [] as ((e: { serial: string }) => void)[],
  devicesChangedHandlers: [] as ((e: { devices: unknown[] }) => void)[],
}));

vi.mock("@yovo/api", () => {
  const noop = (): void => undefined;
  const notConfigured = vi.fn(async () => {
    throw new Error("测试未配置该命令 mock");
  });
  return {
    deviceList: notConfigured,
    deviceRefresh: notConfigured,
    systemInfo: notConfigured,
    settingsSet: notConfigured,
    settingsGet: notConfigured,
    systemReportError: noop,
    systemOpenPath: notConfigured,
    adbExec: notConfigured,
    terminalEval: notConfigured,
    groupRun: notConfigured,
    groupCancel: notConfigured,
    commandlibLoad: notConfigured,
    commandlibSave: notConfigured,
    filesList: notConfigured,
    filesPush: notConfigured,
    filesPull: notConfigured,
    filesCancel: notConfigured,
    filesDelete: notConfigured,
    filesMkdir: notConfigured,
    logCaptureStart: (...a: unknown[]) => mocks.logCaptureStart(...a),
    logCaptureStop: (...a: unknown[]) => mocks.logCaptureStop(...a),
    logClear: (...a: unknown[]) => mocks.logClear(...a),
    logClearDevice: (...a: unknown[]) => mocks.logClearDevice(...a),
    logReplay: (...a: unknown[]) => mocks.logReplay(...a),
    logExport: (...a: unknown[]) => mocks.logExport(...a),
    logProcessSnapshot: (...a: unknown[]) => mocks.logProcessSnapshot(...a),
    logDump: notConfigured,
    onDevicesChanged: (h: (e: { devices: unknown[] }) => void): void => {
      mocks.devicesChangedHandlers.push(h);
    },
    onDeviceOffline: (h: (e: { serial: string }) => void): void => {
      mocks.deviceOfflineHandlers.push(h);
    },
    onLogBatch: (h: (e: { batch: LogBatch }) => void): void => {
      mocks.logBatchHandlers.push(h);
    },
    onLogOverflow: (h: (e: { serial: string }) => void): void => {
      mocks.logOverflowHandlers.push(h);
    },
    onProcessIndex: (h: (e: unknown) => void): void => {
      mocks.processIndexHandlers.push(h);
    },
    onCaptureState: (h: (e: { serial: string; state: string }) => void): void => {
      mocks.captureStateHandlers.push(h);
    },
    onTransferProgress: noop,
    onGroupProgress: noop,
    onTaskSummary: noop,
    onSettingsChanged: noop,
    EVENT_NAMES: {
      devicesChanged: "devices.changed",
      deviceOffline: "device.offline",
      logLines: "log.lines",
      logOverflow: "log.overflow",
      processIndex: "log.processIndex",
      captureState: "log.captureState",
      transferProgress: "transfer.progress",
      groupProgress: "group.progress",
      taskSummary: "task.summary",
      settingsChanged: "settings.changed",
    },
  };
});

import { pidSetOf } from "./pipeline";
import { createLogStore } from "./store";
import type { LogStoreApi } from "./store";

const mk = (seq: number, over: Partial<LogLine> = {}): LogLine => ({
  seq,
  ts: "01-01 00:00:00.000",
  pid: 100,
  tid: 1,
  level: "I",
  tag: "T",
  msg: "m",
  ...over,
});

const batch = (serial: string, lines: LogLine[]): LogBatch => ({
  serial,
  from_seq: lines[0]?.seq ?? 0,
  lines,
  truncated: false,
});

/** 新建独立 store 并绑定设备 S1。 */
function wiredStore(): LogStoreApi {
  const store = createLogStore();
  store.bindSerial("S1");
  store.ensureSession();
  return store;
}

const push = (serial: string, lines: LogLine[]): void => {
  mocks.logBatchHandlers.at(-1)?.({ batch: batch(serial, lines) });
};

beforeEach(() => {
  mocks.logReplay.mockResolvedValue({ serial: "S1", from_seq: 0, lines: [], truncated: false });
  mocks.logExport.mockResolvedValue({ path: "x.txt", lines: 0 });
  mocks.logProcessSnapshot.mockResolvedValue([]);
});

describe("logStore 会话生命周期", () => {
  it("ensureSession 创建默认 All 会话并激活", () => {
    const store = wiredStore();
    expect(store.state.sessions).toHaveLength(1);
    expect(store.state.sessions[0]!.scope).toEqual({ kind: "all" });
    expect(store.state.activeSessionId).toBe(store.state.sessions[0]!.id);
  });

  it("renameSession：修剪标题、拒绝空标题", () => {
    const store = wiredStore();
    const id = store.state.sessions[0]!.id;
    store.renameSession(id, "  主会话  ");
    expect(store.state.sessions[0]!.title).toBe("主会话");
    store.renameSession(id, "   ");
    expect(store.state.sessions[0]!.title).toBe("主会话");
  });

  it("duplicateSession：拷贝 scope/过滤、独立可见区、切换激活", () => {
    const store = wiredStore();
    const src = store.createSession({ kind: "pid", pid: 42 }, "PID 42");
    store.patchFilter(src, { minLevel: "W", keyword: "x" });
    const copy = store.duplicateSession(src);
    expect(copy).not.toBeNull();
    const dup = store.state.sessions.find((s) => s.id === copy);
    expect(dup?.scope).toEqual({ kind: "pid", pid: 42 });
    expect(dup?.minLevel).toBe("W");
    expect(dup?.keyword).toBe("x");
    expect(dup?.title).toContain("副本");
    expect(store.state.activeSessionId).toBe(copy);
  });

  it("closeOthers：仅保留目标并激活", () => {
    const store = wiredStore();
    const a = store.createSession({ kind: "all" }, "A");
    store.createSession({ kind: "all" }, "B");
    store.closeOthers(a);
    expect(store.state.sessions.map((s) => s.id)).toEqual([a]);
    expect(store.state.activeSessionId).toBe(a);
  });

  it("closeSession：关闭最后一个时重建默认 All", () => {
    const store = wiredStore();
    const id = store.state.sessions[0]!.id;
    store.closeSession(id);
    expect(store.state.sessions).toHaveLength(1);
    expect(store.state.sessions[0]!.scope).toEqual({ kind: "all" });
  });
});

describe("logStore 批量事件管线（消费端过滤，ADR-v6-006）", () => {
  it("级别含以上 + 堆叠折叠 + 信号计数 + 镜像行数", () => {
    const store = wiredStore();
    const id = store.state.sessions[0]!.id;
    store.patchFilter(id, { minLevel: "W" });
    push("S1", [
      mk(0, { level: "I", msg: "info" }),
      mk(1, { level: "E", msg: "error one" }),
      mk(2, { level: "E", msg: "at a()" }),
      mk(3, { level: "E", msg: "at b()" }),
      mk(4, { level: "E", tag: "AndroidRuntime", msg: "FATAL EXCEPTION: main" }),
    ]);
    const session = store.state.sessions[0]!;
    expect(session.visible.map((r) => r.line.seq)).toEqual([1, 2, 4]);
    expect(session.visible[1]!.collapsedAfter).toBe(1);
    expect(session.visible[2]!.signal).toBe("crash");
    expect(session.signalCount).toBe(1);
    expect(store.mirror.size()).toBe(5);
  });

  it("关键字/Tag 过滤与信号行标记", () => {
    const store = wiredStore();
    const id = store.state.sessions[0]!.id;
    store.patchFilter(id, { keyword: "hello", tagContains: "app" });
    push("S1", [
      mk(0, { tag: "app", msg: "Hello World" }),
      mk(1, { tag: "app", msg: "bye" }),
      mk(2, { tag: "other", msg: "Hello again" }),
      mk(3, { msg: "ANR in com.foo" }),
    ]);
    const session = store.state.sessions[0]!;
    expect(session.visible.map((r) => r.line.seq)).toEqual([0]);
    expect(session.visible[0]!.signal).toBeUndefined();
    expect(store.mirror.size()).toBe(4);
  });

  it("非焦点设备批次忽略（防串设备）", () => {
    const store = wiredStore();
    push("OTHER", [mk(0)]);
    expect(store.mirror.size()).toBe(0);
    expect(store.state.sessions[0]!.visible).toHaveLength(0);
  });

  it("paused 会话不追加；恢复后 patchFilter 重建可见区", () => {
    const store = wiredStore();
    const id = store.state.sessions[0]!.id;
    store.patchFilter(id, { paused: true });
    push("S1", [mk(0, { level: "E", msg: "e0" })]);
    expect(store.state.sessions[0]!.visible).toHaveLength(0);
    store.patchFilter(id, { paused: false, minLevel: "E" });
    expect(store.state.sessions[0]!.visible.map((r) => r.line.seq)).toEqual([0]);
  });

  it("溢出回补：log.replay from_seq = lastSeq+1", async () => {
    const store = wiredStore();
    push("S1", [mk(0), mk(1)]);
    mocks.logOverflowHandlers.at(-1)?.({ serial: "S1" });
    await vi.waitFor(() => {
      expect(mocks.logReplay).toHaveBeenCalledWith({ serial: "S1", from_seq: 2, limit: 100_000 });
    });
    expect(store.state.overflowed).toBe(true);
  });

  it("掉线：清缓冲、清可见区、停采", () => {
    const store = wiredStore();
    push("S1", [mk(0)]);
    expect(store.mirror.size()).toBe(1);
    mocks.captureStateHandlers.at(-1)?.({ serial: "S1", state: "running" });
    expect(store.state.capturing).toBe(true);
    mocks.deviceOfflineHandlers.at(-1)?.({ serial: "S1" });
    expect(store.state.capturing).toBe(false);
    expect(store.mirror.size()).toBe(0);
    expect(store.state.sessions[0]!.visible).toHaveLength(0);
  });

  it("startCapture/stopCapture 走 IPC 并同步状态", async () => {
    const store = wiredStore();
    await store.startCapture();
    expect(mocks.logCaptureStart).toHaveBeenCalledWith("S1");
    expect(store.state.capturing).toBe(true);
    await store.stopCapture();
    expect(mocks.logCaptureStop).toHaveBeenCalledWith("S1");
    expect(store.state.capturing).toBe(false);
  });

  it("startCapture 清空镜像，只保留启动后的行", async () => {
    const store = wiredStore();
    push("S1", [mk(0)]);
    expect(store.mirror.size()).toBe(1);
    await store.startCapture();
    expect(store.mirror.size()).toBe(0);
    expect(store.state.sessions[0]!.visible).toHaveLength(0);
    push("S1", [mk(1, { msg: "after-start" })]);
    expect(store.state.sessions[0]!.visible).toHaveLength(1);
    expect(store.state.sessions[0]!.visible[0]!.line.msg).toBe("after-start");
    await store.stopCapture();
  });

  it("startCapture 经 replay 填入缓冲（事件丢失兜底）", async () => {
    mocks.logReplay.mockResolvedValue(batch("S1", [mk(3, { msg: "from-replay" })]));
    const store = wiredStore();
    await store.startCapture();
    expect(mocks.logReplay).toHaveBeenCalledWith({ serial: "S1", from_seq: 0, limit: 100_000 });
    expect(store.mirror.size()).toBe(1);
    expect(store.state.sessions[0]!.visible[0]!.line.msg).toBe("from-replay");
    await store.stopCapture();
  });

  it("exportSession 带出 write_mode 与 All 作用域", async () => {
    const store = wiredStore();
    const id = store.state.sessions[0]!.id;
    await store.exportSession(id, "D:\\out.txt", "overwrite");
    expect(mocks.logExport).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "D:\\out.txt",
        write_mode: "overwrite",
        filter: expect.objectContaining({ scope: { kind: "all" } }),
      }),
    );
  });

  it("exportSession 包名空 pids 原样下发（无命中）", async () => {
    const store = wiredStore();
    const id = store.createSession({ kind: "package", pkg: "com.none", includeChild: false }, "none");
    await store.exportSession(id, "D:\\out.txt", "overwrite");
    expect(mocks.logExport).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.objectContaining({ scope: { kind: "package", pids: [] } }),
      }),
    );
  });

  it("bindSerial 等待停采后再切设备", async () => {
    const store = wiredStore();
    await store.startCapture();
    let release!: () => void;
    mocks.logCaptureStop.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const pending = store.bindSerial("S2");
    expect(store.state.serial).toBe("S1");
    release();
    await pending;
    expect(mocks.logCaptureStop).toHaveBeenCalledWith("S1");
    expect(store.state.serial).toBe("S2");
    expect(store.state.capturing).toBe(false);
  });

  it("包名会话创建时立即用进程索引绑定并重放历史行", () => {
    const store = wiredStore();
    push("S1", [
      mk(0, { pid: 10, msg: "foo" }),
      mk(1, { pid: 99, msg: "other" }),
    ]);
    mocks.processIndexHandlers.at(-1)?.({
      serial: "S1",
      entries: [{ pid: 10, name: "com.foo" }],
      degraded: false,
    });
    const id = store.createSession({ kind: "package", pkg: "com.foo", includeChild: false }, "com.foo");
    const session = store.state.sessions.find((s) => s.id === id)!;
    expect(session.visible.map((r) => r.line.seq)).toEqual([0]);
    expect(pidSetOf(session.binding)).toEqual([10]);
  });

  it("进程索引更新后重建包名会话可见区", () => {
    const store = wiredStore();
    push("S1", [mk(0, { pid: 42, msg: "after-rebind" })]);
    const id = store.createSession({ kind: "package", pkg: "com.foo", includeChild: false }, "com.foo");
    expect(store.state.sessions.find((s) => s.id === id)!.visible).toHaveLength(0);
    mocks.processIndexHandlers.at(-1)?.({
      serial: "S1",
      entries: [{ pid: 42, name: "com.foo" }],
      degraded: false,
    });
    expect(store.state.sessions.find((s) => s.id === id)!.visible.map((r) => r.line.msg)).toEqual(["after-rebind"]);
  });
});
