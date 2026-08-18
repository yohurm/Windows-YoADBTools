/**
 * 采集客户端：设备绑定、跟流启停、批次入镜、溢出回补、导出。
 * 只依赖 @yohu/api。
 */

import type { SetStoreFunction } from "solid-js/store";
import {
  logCaptureStart,
  logCaptureStop,
  logClear,
  logClearDevice,
  logExport,
  logProcessSnapshot,
  logReplay,
  onCaptureState,
  onDeviceOffline,
  onLogBatch,
  onLogOverflow,
  onProcessIndex,
  onSettingsChanged,
  settingsGet,
} from "@yohu/api";
import type { LogBatch, ProcessEntry } from "@yohu/api";

import {
  collapseStack,
  matchesLine,
  scanSignal,
  toSessionFilter,
  toWireFilter,
  type RingMirror,
} from "./pipeline";
import type { LogUiState, WorkspaceApi } from "./workspace";

export type ExportWriteMode = "overwrite" | "append";

type CaptureState = LogUiState;

export type CaptureApi = {
  bindSerial: (next: string | null) => Promise<void>;
  setBufferCapacity: (capacity: number) => void;
  startCapture: () => Promise<void>;
  stopCapture: () => Promise<void>;
  clearVisible: (id: number) => Promise<void>;
  clearDevice: () => Promise<void>;
  clearShared: () => Promise<void>;
  refreshProcesses: () => Promise<void>;
  exportSession: (id: number, dest: string | undefined, writeMode: ExportWriteMode) => Promise<string | null>;
  serial: () => string | null;
  bufferCapacity: () => number;
};

export function createCapture(
  state: CaptureState,
  setState: SetStoreFunction<CaptureState>,
  mirror: RingMirror,
  workspace: WorkspaceApi,
): CaptureApi {
  let snapshotTimer: number | undefined;
  let bindGen = 0;

  const serial = (): string | null => state.serial;
  const bufferCapacity = (): number => state.bufferCapacity;

  const sessionIndex = (id: number): number => state.sessions.findIndex((s) => s.id === id);

  const stopSnapshotLoop = (): void => {
    if (snapshotTimer !== undefined) {
      window.clearInterval(snapshotTimer);
      snapshotTimer = undefined;
    }
  };

  const startSnapshotLoop = (): void => {
    stopSnapshotLoop();
    snapshotTimer = window.setInterval(() => {
      if (!state.capturing) {
        stopSnapshotLoop();
        return;
      }
      void pullSnapshot();
    }, 400);
  };

  function setBufferCapacity(capacity: number): void {
    const next = Math.max(1, capacity);
    mirror.setCapacity(next);
    if (next === state.bufferCapacity) return;
    setState("bufferCapacity", next);
    workspace.rebuildAll();
  }

  async function pullSettings(): Promise<void> {
    try {
      const cap = await settingsGet("buffer_capacity");
      if (typeof cap === "number") setBufferCapacity(cap);
    } catch {
      /* 测试/非桌面环境保持默认 */
    }
  }

  async function bindSerial(next: string | null): Promise<void> {
    if (next === state.serial) return;
    const gen = ++bindGen;
    const prev = state.serial;
    const wasCapturing = state.capturing;
    stopSnapshotLoop();
    if (prev && wasCapturing) {
      try {
        await logCaptureStop(prev);
      } catch (e) {
        console.error("切换设备停采失败", e);
      }
      if (gen !== bindGen) return;
    }
    if (gen !== bindGen) return;
    mirror.clear();
    setState({
      serial: next,
      capturing: false,
      overflowed: false,
      processEntries: [],
      indexDegraded: false,
    });
    workspace.rebuildAll();
  }

  async function startCapture(): Promise<void> {
    const current = serial();
    if (!current) {
      throw new Error("请先选择设备");
    }
    workspace.ensureSession();
    mirror.clear();
    setState({ overflowed: false, capturing: true });
    state.sessions.forEach((s) => {
      if (!s.following) workspace.resumeFollow(s.id);
    });
    workspace.rebuildAll();
    try {
      await logCaptureStart(current);
      await pullSnapshot();
      startSnapshotLoop();
    } catch (e) {
      stopSnapshotLoop();
      setState("capturing", false);
      throw e;
    }
  }

  async function pullSnapshot(): Promise<void> {
    const current = serial();
    if (!current) return;
    try {
      const from = Math.max(0, mirror.lastSeqNumber() + 1);
      const batch = await logReplay({ serial: current, from_seq: from, limit: 100_000 });
      if (batch.lines.length > 0) onBatch(batch);
    } catch (e) {
      console.error("log.replay 快照失败", e);
    }
  }

  async function stopCapture(): Promise<void> {
    stopSnapshotLoop();
    const current = serial();
    if (!current) return;
    await logCaptureStop(current);
    setState("capturing", false);
  }

  async function clearVisible(id: number): Promise<void> {
    const idx = sessionIndex(id);
    if (idx >= 0) {
      setState("sessions", idx, { visible: [], signalCount: 0, pendingCount: 0 });
    }
  }

  async function clearDevice(): Promise<void> {
    const current = serial();
    if (!current) return;
    await logClearDevice(current);
    mirror.clear();
    workspace.rebuildAll();
  }

  async function clearShared(): Promise<void> {
    const current = serial();
    if (!current) return;
    await logClear(current);
    mirror.clear();
    workspace.rebuildAll();
  }

  async function refreshProcesses(): Promise<void> {
    const current = serial();
    if (!current) {
      setState({ processEntries: [], indexDegraded: false });
      return;
    }
    try {
      const entries = await logProcessSnapshot(current);
      setState({ processEntries: entries, indexDegraded: false });
      workspace.bindPackageSessions();
    } catch (e) {
      console.error("log.processSnapshot 失败", e);
      setState("indexDegraded", true);
    }
  }

  async function exportSession(
    id: number,
    dest: string | undefined,
    writeMode: ExportWriteMode,
  ): Promise<string | null> {
    const current = serial();
    if (!current) return null;
    const session = state.sessions.find((s) => s.id === id);
    if (!session) return null;
    const result = await logExport({
      serial: current,
      filter: toWireFilter(session),
      path: dest,
      write_mode: writeMode,
    });
    return result.path;
  }

  function onBatch(batch: LogBatch): void {
    if (batch.serial !== serial()) return;
    mirror.pushBatch(batch);
    setState("overflowed", false);

    state.sessions.forEach((session) => {
      if (session.paused) return;
      const filter = toSessionFilter(session);
      const matched = batch.lines.filter((line) => matchesLine(line, filter));
      if (matched.length === 0) return;
      const idx = sessionIndex(session.id);
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
    if (device !== serial()) return;
    setState("overflowed", true);
    try {
      const from = mirror.lastSeqNumber() + 1;
      const batch = await logReplay({ serial: device, from_seq: from, limit: 100_000 });
      onBatch(batch);
      setState("overflowed", true);
    } catch (e) {
      console.error("log.replay 回补失败", e);
    }
  }

  function onIndex(snapshot: { serial: string; entries: ProcessEntry[]; degraded: boolean }): void {
    if (snapshot.serial !== serial()) return;
    setState({
      processEntries: snapshot.entries,
      indexDegraded: snapshot.degraded,
    });
    workspace.bindPackageSessions();
  }

  function onOffline(device: string): void {
    if (device !== serial()) return;
    stopSnapshotLoop();
    setState({ capturing: false, overflowed: false, processEntries: [] });
    mirror.clear();
    workspace.rebuildAll();
  }

  void pullSettings();
  void onSettingsChanged((e) => {
    if (e.key === "buffer.capacity" || e.key === "buffer_capacity") {
      void pullSettings();
    }
  });
  void onLogBatch((e) => onBatch(e.batch));
  void onLogOverflow((e) => void onOverflow(e.serial));
  void onProcessIndex((e) => onIndex(e));
  void onCaptureState((e) => {
    if (e.serial !== serial()) return;
    const running = e.state === "running";
    setState("capturing", running);
    if (running) startSnapshotLoop();
    else stopSnapshotLoop();
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
    serial,
    bufferCapacity,
  };
}
