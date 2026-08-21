/**
 * 日志 store 测试：窗口生命周期 + 每设备引用计数 + 批量事件管线。
 * @yohu/api 全量 mock；事件订阅处理器以数组捕获，测试取最后一个（对应新建实例）。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LogBatch, LogLine } from "@yohu/api";

const mocks = vi.hoisted(() => ({
  logCaptureStart: vi.fn(),
  logCaptureStop: vi.fn(),
  logCaptureStatus: vi.fn(),
  logClear: vi.fn(),
  logClearDevice: vi.fn(),
  logReplay: vi.fn(),
  logExport: vi.fn(),
  logProcessSnapshot: vi.fn(),
  logBatchHandlers: [] as ((e: { batch: LogBatch }) => void)[],
  logOverflowHandlers: [] as ((e: { serial: string }) => void)[],
  processIndexHandlers: [] as ((e: unknown) => void)[],
  captureStateHandlers: [] as ((e: { serial: string; generation: number; state: string }) => void)[],
  deviceOfflineHandlers: [] as ((e: { serial: string }) => void)[],
  devicesChangedHandlers: [] as ((e: { devices: unknown[] }) => void)[],
  settingsChangedHandlers: [] as ((e: { key: string; settings: { buffer_capacity: number } }) => void)[],
}));

vi.mock("@yohu/api", () => {
  const noop = (): void => undefined;
  const notConfigured = vi.fn(async () => {
    throw new Error("测试未配置该命令 mock");
  });
  return {
    APP_SETTINGS_DEFAULT: { buffer_capacity: 10_000 },
    deviceRefresh: notConfigured,
    systemInfo: notConfigured,
    settingsSet: notConfigured,
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
    filesDragOut: notConfigured,
    logCaptureStart: (...a: unknown[]) => mocks.logCaptureStart(...a),
    logCaptureStop: (...a: unknown[]) => mocks.logCaptureStop(...a),
    logCaptureStatus: (...a: unknown[]) => mocks.logCaptureStatus(...a),
    logClear: (...a: unknown[]) => mocks.logClear(...a),
    logClearDevice: (...a: unknown[]) => mocks.logClearDevice(...a),
    logReplay: (...a: unknown[]) => mocks.logReplay(...a),
    logExport: (...a: unknown[]) => mocks.logExport(...a),
    logProcessSnapshot: (...a: unknown[]) => mocks.logProcessSnapshot(...a),
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
    onCaptureState: (h: (e: { serial: string; generation: number; state: string }) => void): void => {
      mocks.captureStateHandlers.push(h);
    },
    onTransferProgress: noop,
    onNativeDragDrop: noop,
    onGroupProgress: noop,
    onTaskSummary: noop,
    onSettingsChanged: (h: (e: { key: string; settings: { buffer_capacity: number } }) => void): void => {
      mocks.settingsChangedHandlers.push(h);
    },
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
import { createLogStore, SYSTEM_SESSION_TITLE } from "./store";
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

function wiredStore(): LogStoreApi {
  const store = createLogStore();
  void store.bindSerial("S1");
  store.ensureSession();
  return store;
}

async function liveStore(): Promise<LogStoreApi> {
  const store = wiredStore();
  await store.startCapture();
  return store;
}

const push = (serial: string, lines: LogLine[]): void => {
  mocks.logBatchHandlers.at(-1)?.({ batch: batch(serial, lines) });
};

beforeEach(() => {
  mocks.logCaptureStart.mockReset();
  mocks.logCaptureStop.mockReset();
  mocks.logCaptureStatus.mockReset();
  mocks.logReplay.mockReset();
  mocks.logExport.mockReset();
  mocks.logProcessSnapshot.mockReset();
  mocks.logReplay.mockResolvedValue({ serial: "S1", from_seq: 0, lines: [], truncated: false });
  mocks.logExport.mockResolvedValue({ path: "x.txt", lines: 0 });
  mocks.logProcessSnapshot.mockResolvedValue([]);
  mocks.logCaptureStart.mockImplementation(async (serial: unknown) => ({
    serial,
    generation: 1,
    adopted: false,
  }));
  mocks.logCaptureStop.mockResolvedValue(undefined);
  mocks.logCaptureStatus.mockImplementation(async (serial: unknown) => ({
    serial,
    capturing: false,
    generation: 0,
    last_seq: 0,
  }));
});

describe("logStore 窗口生命周期", () => {
  it("ensureSession 创建默认 System 窗口并激活", () => {
    const store = wiredStore();
    expect(store.state.sessions).toHaveLength(1);
    expect(store.state.sessions[0]!.title).toBe(SYSTEM_SESSION_TITLE);
    expect(store.state.sessions[0]!.scope).toEqual({ kind: "all" });
    expect(store.state.sessions[0]!.serial).toBe("S1");
    expect(store.state.sessions[0]!.capturing).toBe(false);
    expect(store.state.sessions[0]!.fromSeq).toBeLessThan(0);
    expect(store.state.activeSessionId).toBe(store.state.sessions[0]!.id);
  });

  it("新建窗口空且停，不重放镜像", async () => {
    const store = await liveStore();
    push("S1", [mk(0), mk(1)]);
    expect(store.state.sessions[0]!.visible).toHaveLength(2);
    const id = store.createSession({ kind: "all" }, "A");
    const created = store.state.sessions.find((s) => s.id === id)!;
    expect(created.capturing).toBe(false);
    expect(created.visible).toHaveLength(0);
    expect(created.fromSeq).toBeLessThan(0);
    expect(store.mirror.size()).toBe(2);
  });

  it("renameSession：修剪标题、拒绝空标题", () => {
    const store = wiredStore();
    const id = store.state.sessions[0]!.id;
    store.renameSession(id, "  主会话  ");
    expect(store.state.sessions[0]!.title).toBe("主会话");
    store.renameSession(id, "   ");
    expect(store.state.sessions[0]!.title).toBe("主会话");
  });

  it("duplicateSession：拷贝 scope/过滤，副本空且停", () => {
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
    expect(dup?.capturing).toBe(false);
    expect(dup?.visible).toHaveLength(0);
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

  it("closeSession：关闭最后一个时重建默认 System", () => {
    const store = wiredStore();
    const id = store.state.sessions[0]!.id;
    store.closeSession(id);
    expect(store.state.sessions).toHaveLength(1);
    expect(store.state.sessions[0]!.title).toBe(SYSTEM_SESSION_TITLE);
    expect(store.state.sessions[0]!.scope).toEqual({ kind: "all" });
  });
});

describe("logStore 批量事件管线（消费端过滤，ADR-v6-006）", () => {
  it("级别含以上 + 堆叠折叠 + 信号计数 + 镜像行数", async () => {
    const store = await liveStore();
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

  it("关键字/Tag 过滤与信号行标记", async () => {
    const store = await liveStore();
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

  it("其他设备批次入该机镜像，不进入本窗口", async () => {
    const store = await liveStore();
    push("OTHER", [mk(0)]);
    expect(store.mirror.size()).toBe(0);
    expect(store.mirrors.of("OTHER").size()).toBe(1);
    expect(store.state.sessions[0]!.visible).toHaveLength(0);
  });

  it("离开底部只计数不跟滚；resumeFollow 从镜像重建可见区", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    push("S1", [mk(0), mk(1)]);
    expect(store.state.sessions[0]!.visible).toHaveLength(2);
    store.detachFollow(id);
    expect(store.state.sessions[0]!.following).toBe(false);
    push("S1", [mk(2), mk(3)]);
    expect(store.state.sessions[0]!.visible.map((r) => r.line.seq)).toEqual([0, 1]);
    expect(store.state.sessions[0]!.pendingCount).toBe(2);
    expect(store.mirror.size()).toBe(4);
    store.resumeFollow(id);
    expect(store.state.sessions[0]!.following).toBe(true);
    expect(store.state.sessions[0]!.pendingCount).toBe(0);
    expect(store.state.sessions[0]!.visible.map((r) => r.line.seq)).toEqual([0, 1, 2, 3]);
  });

  it("paused 不增加 pending；恢复后 patchFilter 重建可见区", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    store.detachFollow(id);
    store.patchFilter(id, { paused: true });
    push("S1", [mk(0, { level: "E", msg: "e0" })]);
    expect(store.state.sessions[0]!.pendingCount).toBe(0);
    expect(store.state.sessions[0]!.visible).toHaveLength(0);
    store.patchFilter(id, { paused: false, minLevel: "E" });
    expect(store.state.sessions[0]!.visible.map((r) => r.line.seq)).toEqual([0]);
  });

  it("paused 窗口不追加；恢复后 patchFilter 重建可见区", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    store.patchFilter(id, { paused: true });
    push("S1", [mk(0, { level: "E", msg: "e0" })]);
    expect(store.state.sessions[0]!.visible).toHaveLength(0);
    store.patchFilter(id, { paused: false, minLevel: "E" });
    expect(store.state.sessions[0]!.visible.map((r) => r.line.seq)).toEqual([0]);
  });

  it("溢出回补：log.replay from_seq = lastSeq+1", async () => {
    const store = await liveStore();
    push("S1", [mk(0), mk(1)]);
    mocks.logOverflowHandlers.at(-1)?.({ serial: "S1" });
    await vi.waitFor(() => {
      expect(mocks.logReplay).toHaveBeenCalledWith({ serial: "S1", from_seq: 2, limit: 100_000 });
    });
    expect(store.state.overflowed).toBe(true);
  });

  it("掉线：只清该设备窗口与镜像，停该机采集", async () => {
    const store = await liveStore();
    push("S1", [mk(0)]);
    expect(store.mirror.size()).toBe(1);
    expect(store.state.sessions[0]!.capturing).toBe(true);
    mocks.deviceOfflineHandlers.at(-1)?.({ serial: "S1" });
    expect(store.state.sessions[0]!.capturing).toBe(false);
    expect(store.state.capturing).toBe(false);
    expect(store.mirror.size()).toBe(0);
    expect(store.state.sessions[0]!.visible).toHaveLength(0);
  });

  it("startCapture/stopCapture 走 IPC 并同步窗口状态", async () => {
    const store = wiredStore();
    await store.startCapture();
    expect(mocks.logCaptureStart).toHaveBeenCalledWith("S1");
    expect(store.state.sessions[0]!.capturing).toBe(true);
    expect(store.state.capturing).toBe(true);
    await store.stopCapture();
    expect(mocks.logCaptureStop).toHaveBeenCalledWith("S1");
    expect(store.state.sessions[0]!.capturing).toBe(false);
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

  it("重叠 start 闸门串行：首次 IPC，第二次已 capturing 则跳过", async () => {
    let release!: () => void;
    mocks.logCaptureStart.mockReturnValueOnce(
      new Promise((resolve) => {
        release = () => resolve({ serial: "S1", generation: 1, adopted: false });
      }),
    );
    const store = createLogStore();
    await store.bindSerial("S1");
    store.ensureSession();
    const a = store.startCapture();
    const b = store.startCapture();
    await vi.waitFor(() => {
      expect(mocks.logCaptureStart).toHaveBeenCalledTimes(1);
      expect(store.state.startPending).toBe(true);
    });
    expect(store.state.sessions[0]!.capturing).toBe(false);
    release();
    await Promise.all([a, b]);
    expect(mocks.logCaptureStart).toHaveBeenCalledTimes(1);
    expect(store.state.sessions[0]!.capturing).toBe(true);
    expect(store.state.generation).toBe(1);
    expect(store.state.startPending).toBe(false);
  });

  it("同设备 bindSerial 不 stop、不改窗口 capturing", async () => {
    const store = createLogStore();
    await store.bindSerial("S1");
    store.ensureSession();
    await store.startCapture();
    expect(store.state.sessions[0]!.capturing).toBe(true);
    mocks.logCaptureStatus.mockResolvedValueOnce({
      serial: "S1",
      capturing: true,
      generation: 7,
      last_seq: 3,
    });
    await store.bindSerial("S1");
    expect(mocks.logCaptureStop).not.toHaveBeenCalled();
    expect(store.state.sessions[0]!.capturing).toBe(true);
    expect(store.state.generation).toBe(7);
  });

  it("start 失败后 pending 清除；若 status 已 Live 则窗口 capturing", async () => {
    const store = createLogStore();
    await store.bindSerial("S1");
    store.ensureSession();
    mocks.logCaptureStart.mockRejectedValueOnce(new Error("ipc"));
    mocks.logCaptureStatus.mockResolvedValueOnce({
      serial: "S1",
      capturing: true,
      generation: 3,
      last_seq: 0,
    });
    await expect(store.startCapture()).rejects.toThrow("ipc");
    expect(store.state.startPending).toBe(false);
    expect(store.state.sessions[0]!.capturing).toBe(true);
    expect(store.state.generation).toBe(3);
  });

  it("start 成功后若 status 世代已结束则纠正窗口 capturing", async () => {
    const store = createLogStore();
    await store.bindSerial("S1");
    store.ensureSession();
    mocks.logCaptureStatus.mockResolvedValueOnce({
      serial: "S1",
      capturing: false,
      generation: 1,
      last_seq: 0,
    });
    await store.startCapture();
    expect(store.state.sessions[0]!.capturing).toBe(false);
    expect(store.state.generation).toBe(1);
    expect(store.state.startPending).toBe(false);
  });

  it("startPending 期间 stop 立即发 stop IPC，不等待 start 返回", async () => {
    let releaseStart!: (value: { serial: string; generation: number; adopted: boolean }) => void;
    mocks.logCaptureStart.mockReturnValueOnce(
      new Promise((resolve) => {
        releaseStart = resolve;
      }),
    );
    const store = createLogStore();
    await store.bindSerial("S1");
    store.ensureSession();
    const starting = store.startCapture();
    await vi.waitFor(() => {
      expect(store.state.startPending).toBe(true);
    });
    const stopping = store.stopCapture();
    expect(mocks.logCaptureStop).toHaveBeenCalledWith("S1");
    releaseStart({ serial: "S1", generation: 1, adopted: false });
    await starting.catch(() => undefined);
    await stopping;
    expect(store.state.startPending).toBe(false);
    expect(store.state.sessions[0]!.capturing).toBe(false);
  });

  it("start 失败且 status 未采集时 capturing 保持 false", async () => {
    const store = createLogStore();
    await store.bindSerial("S1");
    store.ensureSession();
    mocks.logCaptureStart.mockRejectedValueOnce(new Error("offline"));
    await expect(store.startCapture()).rejects.toThrow("offline");
    expect(store.state.startPending).toBe(false);
    expect(store.state.sessions[0]!.capturing).toBe(false);
  });

  it("Stop 入队后再 Start：先停后开，不会吞掉第二次 Start", async () => {
    const store = createLogStore();
    await store.bindSerial("S1");
    store.ensureSession();
    await store.startCapture();
    let releaseStop!: () => void;
    mocks.logCaptureStop.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        releaseStop = resolve;
      }),
    );
    mocks.logCaptureStart.mockResolvedValueOnce({ serial: "S1", generation: 2, adopted: false });
    const stopping = store.stopCapture();
    const starting = store.startCapture();
    expect(mocks.logCaptureStart).toHaveBeenCalledTimes(1);
    releaseStop();
    await stopping;
    await starting;
    expect(mocks.logCaptureStart).toHaveBeenCalledTimes(2);
    expect(store.state.generation).toBe(2);
    expect(store.state.sessions[0]!.capturing).toBe(true);
  });

  it("adopt 不清空镜像，本窗口从 fromSeq 起收新行", async () => {
    const store = wiredStore();
    push("S1", [mk(0, { msg: "kept" })]);
    mocks.logCaptureStart.mockResolvedValueOnce({ serial: "S1", generation: 4, adopted: true });
    await store.startCapture();
    expect(store.mirror.size()).toBe(1);
    expect(store.state.sessions[0]!.visible).toHaveLength(0);
    expect(store.state.sessions[0]!.fromSeq).toBe(1);
    expect(store.state.sessions[0]!.capturing).toBe(true);
    expect(store.state.generation).toBe(4);
    push("S1", [mk(1, { msg: "fresh" })]);
    expect(store.state.sessions[0]!.visible[0]!.line.msg).toBe("fresh");
  });

  it("迟到的旧世代 Stopped 不能打断新世代", async () => {
    const store = wiredStore();
    await store.startCapture();
    expect(store.state.sessions[0]!.capturing).toBe(true);
    mocks.logCaptureStart.mockResolvedValueOnce({ serial: "S1", generation: 2, adopted: false });
    await store.stopCapture();
    await store.startCapture();
    expect(store.state.generation).toBe(2);
    expect(store.state.sessions[0]!.capturing).toBe(true);
    mocks.captureStateHandlers.at(-1)?.({ serial: "S1", generation: 1, state: "stopped" });
    expect(store.state.sessions[0]!.capturing).toBe(true);
    expect(store.state.generation).toBe(2);
  });

  it("切焦点不停已采设备，窗口仍收行", async () => {
    const store = await liveStore();
    expect(store.state.sessions[0]!.capturing).toBe(true);
    await store.bindSerial("S2");
    expect(mocks.logCaptureStop).not.toHaveBeenCalled();
    expect(store.state.serial).toBe("S2");
    expect(store.state.sessions[0]!.serial).toBe("S1");
    expect(store.state.sessions[0]!.capturing).toBe(true);
    push("S1", [mk(0, { msg: "still" })]);
    expect(store.state.sessions[0]!.visible[0]!.line.msg).toBe("still");
  });

  it("包名窗口创建时绑定进程但不重放历史行", async () => {
    const store = await liveStore();
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
    expect(session.visible).toHaveLength(0);
    expect(session.capturing).toBe(false);
    expect(pidSetOf(session.binding)).toEqual([10]);
  });

  it("采集中的包名窗口在进程索引更新后重建可见区", async () => {
    const store = wiredStore();
    const id = store.createSession({ kind: "package", pkg: "com.foo", includeChild: false }, "com.foo");
    store.setActive(id);
    await store.startCapture();
    push("S1", [mk(0, { pid: 42, msg: "after-rebind" })]);
    expect(store.state.sessions.find((s) => s.id === id)!.visible).toHaveLength(0);
    mocks.processIndexHandlers.at(-1)?.({
      serial: "S1",
      entries: [{ pid: 42, name: "com.foo" }],
      degraded: false,
    });
    expect(store.state.sessions.find((s) => s.id === id)!.visible.map((r) => r.line.msg)).toEqual(["after-rebind"]);
  });
});

describe("logStore 多窗口 × 多设备", () => {
  it("两窗口同设备：只停当前，末窗口停止才 log.capture.stop", async () => {
    const store = await liveStore();
    const system = store.state.sessions[0]!;
    push("S1", [mk(0), mk(1)]);
    const other = store.createSession({ kind: "all" }, "A");
    store.setActive(other);
    await store.startCapture();
    expect(mocks.logCaptureStart).toHaveBeenCalledTimes(1);
    push("S1", [mk(2), mk(3)]);
    expect(store.state.sessions.find((s) => s.id === system.id)!.visible.map((r) => r.line.seq)).toEqual([0, 1, 2, 3]);
    expect(store.state.sessions.find((s) => s.id === other)!.visible.map((r) => r.line.seq)).toEqual([2, 3]);

    await store.stopCapture();
    expect(mocks.logCaptureStop).not.toHaveBeenCalled();
    expect(store.state.sessions.find((s) => s.id === other)!.capturing).toBe(false);
    expect(store.state.sessions.find((s) => s.id === system.id)!.capturing).toBe(true);
    push("S1", [mk(4)]);
    expect(store.state.sessions.find((s) => s.id === other)!.visible.map((r) => r.line.seq)).toEqual([2, 3]);
    expect(store.state.sessions.find((s) => s.id === system.id)!.visible.map((r) => r.line.seq)).toEqual([0, 1, 2, 3, 4]);

    store.setActive(system.id);
    await store.stopCapture();
    expect(mocks.logCaptureStop).toHaveBeenCalledTimes(1);
    expect(mocks.logCaptureStop).toHaveBeenCalledWith("S1");
  });

  it("两窗口两设备：各打一次 start；停 A 不 stop B", async () => {
    const store = wiredStore();
    await store.startCapture();
    mocks.logCaptureStart.mockImplementation(async (serial: unknown) => ({
      serial,
      generation: serial === "S2" ? 8 : 1,
      adopted: false,
    }));
    const b = store.createSession({ kind: "all" }, "B", "S2");
    store.setActive(b);
    await store.startCapture();
    expect(mocks.logCaptureStart).toHaveBeenCalledWith("S1");
    expect(mocks.logCaptureStart).toHaveBeenCalledWith("S2");
    expect(store.state.sessions[0]!.capturing).toBe(true);
    expect(store.state.sessions.find((s) => s.id === b)!.capturing).toBe(true);

    await store.stopCapture();
    expect(mocks.logCaptureStop).toHaveBeenCalledTimes(1);
    expect(mocks.logCaptureStop).toHaveBeenCalledWith("S2");
    expect(store.state.sessions[0]!.capturing).toBe(true);
    expect(store.state.sessions.find((s) => s.id === b)!.capturing).toBe(false);

    push("S1", [mk(0, { msg: "a-still" })]);
    expect(store.state.sessions[0]!.visible[0]!.line.msg).toBe("a-still");
  });

  it("掉线只影响该 serial 的窗口", async () => {
    const store = wiredStore();
    await store.startCapture();
    const b = store.createSession({ kind: "all" }, "B", "S2");
    store.setActive(b);
    mocks.logCaptureStart.mockResolvedValueOnce({ serial: "S2", generation: 3, adopted: false });
    await store.startCapture();
    push("S1", [mk(0, { msg: "keep-a" })]);
    push("S2", [mk(0, { msg: "drop-b" })]);
    mocks.deviceOfflineHandlers.at(-1)?.({ serial: "S2" });
    expect(store.state.sessions.find((s) => s.id === b)!.capturing).toBe(false);
    expect(store.state.sessions.find((s) => s.id === b)!.visible).toHaveLength(0);
    expect(store.state.sessions[0]!.capturing).toBe(true);
    expect(store.state.sessions[0]!.visible[0]!.line.msg).toBe("keep-a");
    expect(store.mirrors.of("S1").size()).toBe(1);
    expect(store.mirrors.of("S2").size()).toBe(0);
  });
});

describe("logStore 设置联动", () => {
  it("settings.changed buffer_capacity 立即裁剪镜像容量", async () => {
    const store = wiredStore();
    expect(store.state.bufferCapacity).toBe(10_000);
    mocks.settingsChangedHandlers.at(-1)?.({
      key: "buffer_capacity",
      settings: { buffer_capacity: 50 },
    });
    await vi.waitFor(() => {
      expect(store.state.bufferCapacity).toBe(50);
    });
  });

  it("settings.changed 展示列键不打 buffer_capacity", async () => {
    const store = wiredStore();
    mocks.settingsChangedHandlers.at(-1)?.({
      key: "log_display_columns",
      settings: { buffer_capacity: 10_000 },
    });
    await Promise.resolve();
    expect(store.state.bufferCapacity).toBe(10_000);
  });
});
