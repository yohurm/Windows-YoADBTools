/**
 * 采集客户端：窗口级启停 + 每设备引用计数。
 * 每设备至多一路 logcat；切焦点不停其他设备流。只依赖 @yohu/api。
 */

import type { SetStoreFunction } from "solid-js/store";
import {
  logCaptureStart,
  logCaptureStatus,
  logCaptureStop,
  logClear,
  logClearDevice,
  logExport,
  logProcessSnapshot,
  logReplay,
  logSessionFileAppend,
  logSessionFileClose,
  logSessionFileOpen,
  onCaptureState,
  onDeviceOffline,
  onLogBatch,
  onLogOverflow,
  onProcessIndex,
  onSettingsChanged,
  YoLog,
} from "@yohu/api";
import type { CaptureStatus, LogBatch, LogWriteMode, ProcessEntry } from "@yohu/api";

import {
  collapseStack,
  matchesLine,
  scanSignal,
  toSessionFilter,
  type MirrorBank,
} from "./pipeline";
import type { LogSessionState, LogUiState, WorkspaceApi } from "./workspace";

type CaptureStore = LogUiState;

/** 设备采集状态快照轮询间隔（ms）。 */
const SNAPSHOT_POLL_MS = 400;
/** 单次 log.replay 回补/快照的最大行数（与 buffer_capacity 无关；上限兜底）。 */
const REPLAY_LIMIT = 100_000;

export type CaptureApi = {
  bindSerial: (next: string | null) => Promise<void>;
  setBufferCapacity: (capacity: number) => void;
  startCapture: (mode?: LogWriteMode) => Promise<void>;
  stopCapture: () => Promise<void>;
  clearVisible: (id: number) => Promise<void>;
  clearDevice: () => Promise<void>;
  clearShared: () => Promise<void>;
  refreshProcesses: (serial?: string | null) => Promise<void>;
  exportSession: (sources: string[], path?: string) => Promise<string | null>;
  closeSession: (id: number) => void;
  closeOthers: (id: number) => void;
  serial: () => string | null;
  bufferCapacity: () => number;
};

export function createCapture(
  state: CaptureStore,
  setState: SetStoreFunction<CaptureStore>,
  mirrors: MirrorBank,
  workspace: WorkspaceApi,
): CaptureApi {
  let snapshotTimer: number | undefined;
  let bindGen = 0;
  /** start / stop 互斥；bind 不再停流，可与采集并行 */
  let gate: Promise<void> = Promise.resolve();
  const lastStoppedGen = new Map<string, number>();
  /** 窗口 id → 已打开的实时日志文件路径（core 侧文件键 window_id=session.id） */
  const windowFiles = new Map<number, string>();

  function runExclusive(fn: () => Promise<void>): Promise<void> {
    const run = gate.then(fn, fn);
    gate = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function openWindowFile(session: LogSessionState, mode?: LogWriteMode): Promise<void> {
    if (windowFiles.has(session.id)) return;
    const serial = session.serial ?? state.serial;
    if (!serial) return;
    try {
      const info = await logSessionFileOpen({
        serial,
        window_id: session.id,
        name: session.title || `窗口${session.id}`,
        mode: mode ?? "overwrite",
      });
      windowFiles.set(session.id, info.path);
    } catch (e) {
      console.error("log.sessionFileOpen 失败", e);
    }
  }

  function closeWindowFile(serial: string | null, windowId: number): void {
    if (!windowFiles.has(windowId)) return;
    windowFiles.delete(windowId);
    if (!serial) return;
    void logSessionFileClose({ serial, window_id: windowId }).catch((e) =>
      console.error("log.sessionFileClose 失败", e),
    );
  }

  function closeDeviceFiles(device: string): void {
    state.sessions.forEach((s) => {
      if (s.serial === device) closeWindowFile(device, s.id);
    });
  }

  const serial = (): string | null => state.serial;
  const bufferCapacity = (): number => state.bufferCapacity;
  const sessionIndex = (id: number): number => state.sessions.findIndex((s) => s.id === id);

  function activeSession(): LogSessionState | null {
    const id = state.activeSessionId;
    if (id === null) return null;
    return state.sessions.find((s) => s.id === id) ?? null;
  }

  function capturingSerials(): string[] {
    const set = new Set<string>();
    for (const session of state.sessions) {
      if (session.capturing && session.serial) set.add(session.serial);
    }
    return [...set];
  }

  function capturingCount(device: string): number {
    return state.sessions.filter((s) => s.serial === device && s.capturing).length;
  }

  function syncFlags(): void {
    setState("capturing", state.sessions.some((s) => s.capturing));
  }

  function setDeviceGen(device: string, generation: number): void {
    setState("generations", device, generation);
    if (state.serial === device) setState("generation", generation);
  }

  const stopSnapshotLoop = (): void => {
    if (snapshotTimer !== undefined) {
      window.clearInterval(snapshotTimer);
      snapshotTimer = undefined;
    }
  };

  const startSnapshotLoop = (): void => {
    stopSnapshotLoop();
    snapshotTimer = window.setInterval(() => {
      const devices = capturingSerials();
      if (devices.length === 0) {
        stopSnapshotLoop();
        return;
      }
      for (const device of devices) {
        void pullSnapshot(device);
      }
    }, SNAPSHOT_POLL_MS);
  };

  function stopWindowsOn(device: string): void {
    state.sessions.forEach((session, idx) => {
      if (session.serial !== device || !session.capturing) return;
      closeWindowFile(device, session.id);
      setState("sessions", idx, { capturing: false });
    });
    syncFlags();
    if (capturingSerials().length === 0) stopSnapshotLoop();
  }

  function applyEvent(device: string, generation: number, running: boolean): void {
    const stopped = lastStoppedGen.get(device) ?? 0;
    const currentGen = state.generations[device] ?? 0;
    if (running) {
      if (generation <= stopped || generation < currentGen) return;
      setDeviceGen(device, generation);
      return;
    }
    if (generation < stopped) return;
    lastStoppedGen.set(device, generation);
    if (generation < currentGen) return;
    setDeviceGen(device, generation);
    stopWindowsOn(device);
  }

  function applyStatus(status: CaptureStatus): void {
    if (status.capturing) {
      if (status.generation > 0 && (lastStoppedGen.get(status.serial) ?? 0) >= status.generation) {
        lastStoppedGen.set(status.serial, status.generation - 1);
      }
      setDeviceGen(status.serial, status.generation);
      return;
    }
    const prev = Math.max(lastStoppedGen.get(status.serial) ?? 0, status.generation, state.generations[status.serial] ?? 0);
    lastStoppedGen.set(status.serial, prev);
    setDeviceGen(status.serial, status.generation);
    stopWindowsOn(status.serial);
  }

  function setBufferCapacity(capacity: number): void {
    const next = Math.max(1, capacity);
    mirrors.setCapacity(next);
    if (next === state.bufferCapacity) return;
    setState("bufferCapacity", next);
    workspace.rebuildAll();
  }

  async function confirmStart(device: string, startedGen: number, sessionId: number): Promise<void> {
    try {
      const status = await logCaptureStatus(device);
      if (status.capturing || status.generation >= startedGen) {
        if (status.capturing) {
          if (status.generation > 0 && (lastStoppedGen.get(device) ?? 0) >= status.generation) {
            lastStoppedGen.set(device, status.generation - 1);
          }
          setDeviceGen(device, status.generation);
          await pullSnapshot(device);
          return;
        }
        applyStatus(status);
        const idx = sessionIndex(sessionId);
        if (idx >= 0 && state.sessions[idx]!.serial === device) {
          setState("sessions", idx, { capturing: false });
          syncFlags();
        }
      }
    } catch (e) {
      console.error("log.capture.status 失败", e);
    }
  }

  async function bindSerial(next: string | null): Promise<void> {
    if (next !== state.serial) {
      setState("serial", next);
    }
    workspace.assignDefaultSerial(next);
    const gen = ++bindGen;
    if (next && state.serial === next) {
      try {
        const status = await logCaptureStatus(next);
        if (gen !== bindGen || state.serial !== next) return;
        setDeviceGen(next, status.generation);
      } catch (e) {
        console.error("log.capture.status 失败", e);
      }
    }
  }

  async function startCapture(mode?: LogWriteMode): Promise<void> {
    return runExclusive(async () => {
      workspace.ensureSession();
      const session = activeSession();
      if (!session) {
        throw new Error("请先选择设备");
      }
      const current = session.serial ?? state.serial;
      if (!current) {
        throw new Error("请先选择设备");
      }
      const idx = sessionIndex(session.id);
      if (idx < 0) return;
      if (!session.serial) {
        setState("sessions", idx, { serial: current });
      }
      if (state.sessions[idx]!.capturing) return;

      setState({ startPending: true, startPendingId: session.id });
      try {
        const already = capturingCount(current);
        let startedGen = state.generations[current] ?? 0;
        if (already === 0) {
          const result = await logCaptureStart(current);
          YoLog.info("logs", "采集已启动", { serial: current, generation: result.generation, adopted: result.adopted });
          startedGen = result.generation;
          setDeviceGen(current, result.generation);
          if (!result.adopted) {
            mirrors.clear(current);
            if (state.serial === current) setState("overflowed", false);
          }
        }
        const fromSeq = Math.max(0, mirrors.of(current).lastSeqNumber() + 1);
        await openWindowFile(session, mode);
        setState("sessions", idx, { capturing: true, fromSeq, serial: current });
        syncFlags();
        startSnapshotLoop();
        if (already === 0) await pullSnapshot(current);
        await confirmStart(current, startedGen, session.id);
      } catch (e) {
        try {
          const status = await logCaptureStatus(current);
          if (status.capturing) {
            const fromSeq = Math.max(0, mirrors.of(current).lastSeqNumber() + 1);
            await openWindowFile(session, mode);
            setState("sessions", idx, { capturing: true, fromSeq, serial: current });
            setDeviceGen(current, status.generation);
            syncFlags();
            startSnapshotLoop();
          }
        } catch (statusErr) {
          console.error("log.capture.status 失败", statusErr);
        }
        throw e;
      } finally {
        setState({ startPending: false, startPendingId: null });
      }
    });
  }

  async function pullSnapshot(device: string): Promise<void> {
    try {
      const from = Math.max(0, mirrors.of(device).lastSeqNumber() + 1);
      const batch = await logReplay({ serial: device, from_seq: from, limit: REPLAY_LIMIT });
      if (batch?.lines && batch.lines.length > 0) onBatch(batch);
    } catch (e) {
      console.error("log.replay 快照失败", e);
    }
  }

  async function stopCapture(): Promise<void> {
    const session = activeSession();
    const current = session?.serial ?? state.serial;
    if (!current || !session) return;
    const lastOnDevice = capturingCount(current) <= 1 && (session.capturing || state.startPendingId === session.id);
    const interrupt = lastOnDevice ? logCaptureStop(current) : Promise.resolve();
    return runExclusive(async () => {
      const idx = sessionIndex(session.id);
      if (idx >= 0) {
        setState("sessions", idx, { capturing: false });
        syncFlags();
      }
      closeWindowFile(current, session.id);
      if (!lastOnDevice) return;
      YoLog.info("logs", "采集停止", { serial: current });
      try {
        await interrupt;
      } catch (e) {
        throw e;
      }
      lastStoppedGen.set(current, Math.max(lastStoppedGen.get(current) ?? 0, state.generations[current] ?? 0));
      if (capturingSerials().length === 0) stopSnapshotLoop();
      try {
        const status = await logCaptureStatus(current);
        if (!status.capturing) {
          setDeviceGen(current, status.generation);
          stopWindowsOn(current);
        }
      } catch (e) {
        console.error("log.capture.status 失败", e);
      }
    });
  }

  function releaseDeviceIfIdle(device: string | null, wasCapturing: boolean): void {
    if (!device || !wasCapturing) return;
    if (capturingCount(device) > 0) return;
    void logCaptureStop(device).catch((e) => {
      console.error("关闭窗口后停采失败", e);
    });
    if (capturingSerials().length === 0) stopSnapshotLoop();
  }

  function closeSession(id: number): void {
    const session = state.sessions.find((s) => s.id === id);
    closeWindowFile(session?.serial ?? null, id);
    workspace.closeSession(id);
    syncFlags();
    releaseDeviceIfIdle(session?.serial ?? null, session?.capturing ?? false);
  }

  function closeOthers(id: number): void {
    const closed = state.sessions.filter((s) => s.id !== id);
    closed.forEach((s) => closeWindowFile(s.serial, s.id));
    workspace.closeOthers(id);
    syncFlags();
    const devices = new Set(closed.filter((s) => s.capturing && s.serial).map((s) => s.serial!));
    for (const device of devices) {
      releaseDeviceIfIdle(device, true);
    }
  }

  async function clearVisible(id: number): Promise<void> {
    const idx = sessionIndex(id);
    if (idx >= 0) {
      setState("sessions", idx, { visible: [], signalCount: 0, pendingCount: 0 });
    }
  }

  async function clearDevice(): Promise<void> {
    const current = activeSession()?.serial ?? state.serial;
    if (!current) return;
    await logClearDevice(current);
    mirrors.clear(current);
    state.sessions.forEach((session, i) => {
      if (session.serial !== current) return;
      setState("sessions", i, {
        visible: [],
        signalCount: 0,
        pendingCount: 0,
        fromSeq: session.capturing ? 0 : session.fromSeq,
      });
    });
  }

  async function clearShared(): Promise<void> {
    const current = activeSession()?.serial ?? state.serial;
    if (!current) return;
    await logClear(current);
    mirrors.clear(current);
    workspace.rebuildAll();
  }

  async function refreshProcesses(target?: string | null): Promise<void> {
    const current = target ?? activeSession()?.serial ?? state.serial;
    if (!current) {
      setState({ processEntries: [], indexDegraded: false });
      return;
    }
    try {
      const entries = await logProcessSnapshot(current);
      setState({ processEntries: entries, indexDegraded: false });
      workspace.bindPackageSessions(current);
    } catch (e) {
      console.error("log.processSnapshot 失败", e);
      setState("indexDegraded", true);
    }
  }

  async function exportSession(
    sources: string[],
    path: string | undefined,
  ): Promise<string | null> {
    if (sources.length === 0) return null;
    const result = await logExport({ sources, path });
    return result.path;
  }

  function onBatch(batch: LogBatch): void {
    mirrors.of(batch.serial).pushBatch(batch);
    if (activeSession()?.serial === batch.serial) {
      setState("overflowed", false);
    }

    state.sessions.forEach((session) => {
      if (session.serial !== batch.serial) return;
      if (!session.capturing || session.fromSeq < 0) return;
      const filter = toSessionFilter(session);
      const matched = batch.lines.filter((line) => line.seq >= session.fromSeq && matchesLine(line, filter));
      if (matched.length === 0) return;
      const idx = sessionIndex(session.id);

      // 实时写窗口日志文件：与滚动/暂停无关，按 seq 去重在 core
      if (windowFiles.has(session.id)) {
        void logSessionFileAppend({ serial: batch.serial, window_id: session.id, lines: matched }).catch(
          (e) => console.error("log.sessionFileAppend 失败", e),
        );
      }

      if (session.paused) return;
      const signals = matched.reduce((acc, l) => acc + (scanSignal(l) ? 1 : 0), 0);
      if (!session.following) {
        setState("sessions", idx, {
          pendingCount: session.pendingCount + matched.length,
          signalCount: session.signalCount + signals,
        });
        return;
      }
      const cap = bufferCapacity();
      const current = state.sessions[idx]!.visible;
      const merged = [...current, ...collapseStack(matched)];
      const trimmed = merged.length > cap ? merged.slice(merged.length - cap) : merged;
      setState("sessions", idx, {
        visible: trimmed,
        signalCount: session.signalCount + signals,
      });
    });
  }

  async function onOverflow(device: string): Promise<void> {
    if (activeSession()?.serial === device || state.serial === device) {
      setState("overflowed", true);
    }
    try {
      const from = mirrors.of(device).lastSeqNumber() + 1;
      const batch = await logReplay({ serial: device, from_seq: from, limit: REPLAY_LIMIT });
      onBatch(batch);
      if (activeSession()?.serial === device || state.serial === device) {
        setState("overflowed", true);
      }
    } catch (e) {
      console.error("log.replay 回补失败", e);
    }
  }

  function onIndex(snapshot: { serial: string; entries: ProcessEntry[]; degraded: boolean }): void {
    const relevant =
      snapshot.serial === state.serial ||
      snapshot.serial === activeSession()?.serial ||
      state.sessions.some((s) => s.serial === snapshot.serial);
    if (!relevant) return;
    if (snapshot.serial === (activeSession()?.serial ?? state.serial)) {
      setState({
        processEntries: snapshot.entries,
        indexDegraded: snapshot.degraded,
      });
    }
    workspace.bindPackageSessions(snapshot.serial, snapshot.entries);
  }

  function onOffline(device: string): void {
    lastStoppedGen.set(device, Math.max(lastStoppedGen.get(device) ?? 0, state.generations[device] ?? 0));
    setDeviceGen(device, 0);
    if (state.startPendingId !== null) {
      const pending = state.sessions.find((s) => s.id === state.startPendingId);
      if (pending?.serial === device) {
        setState({ startPending: false, startPendingId: null });
      }
    }
    mirrors.clear(device);
    closeDeviceFiles(device);
    workspace.resetDeviceViews(device);
    syncFlags();
    if (capturingSerials().length === 0) stopSnapshotLoop();
    if (state.serial === device) {
      setState({ overflowed: false, processEntries: [] });
    }
  }

  void onSettingsChanged((e) => {
    if (e.key === "buffer_capacity") {
      setBufferCapacity(e.settings.buffer_capacity);
    }
  });
  void onLogBatch((e) => onBatch(e.batch));
  void onLogOverflow((e) => void onOverflow(e.serial));
  void onProcessIndex((e) => onIndex(e));
  void onCaptureState((e) => {
    applyEvent(e.serial, e.generation, e.state === "running");
  });
  void onDeviceOffline((e) => onOffline(e.serial));

  return {
    bindSerial,
    setBufferCapacity,
    startCapture,
    stopCapture,
    clearVisible,
    clearDevice,
    clearShared,
    refreshProcesses,
    exportSession,
    closeSession,
    closeOthers,
    serial,
    bufferCapacity,
  };
}
