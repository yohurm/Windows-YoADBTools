/**
 * 日志模块 store：设备共享缓冲镜像 + 多会话（消费端过滤，ADR-v6-006）。
 *
 * 数据流：log.lines 批量事件 → RingMirror 合并 → 各未暂停会话过滤追加 →
 * 可见列表（display.limit 上限，堆叠折叠显示层）→ YVirtualList。
 * 溢出：log.overflow → log.replay(fromSeq+1) 回补（丢推送不丢环）。
 */

import { createStore } from "solid-js/store";

import {
  logCaptureStart,
  logCaptureStop,
  logClear,
  logClearDevice,
  logExport,
  logReplay,
  onCaptureState,
  onDeviceOffline,
  onLogBatch,
  onLogOverflow,
  onProcessIndex,
} from "@yovo/api";
import type { LogBatch, LogFilter, LogLine, ProcessEntry } from "@yovo/api";
import { deviceStore, settingsStore } from "@yovo/app";

import {
  PidBinding,
  RingMirror,
  SessionFilter,
  SessionScope,
  ViewRow,
  collapseStack,
  matchesLine,
  scanSignal,
} from "./pipeline";

export interface LogSessionState {
  id: number;
  title: string;
  scope: SessionScope;
  minLevel: string | null;
  tagContains: string;
  keyword: string;
  paused: boolean;
  autoScroll: boolean;
  /** 可见窗口内的信号数（崩溃/ANR） */
  signalCount: number;
  visible: ViewRow[];
  /** Package 作用域的 PID 绑定（非响应式辅助对象） */
  binding: PidBinding;
}

let nextSessionId = 1;

const toFilter = (s: LogSessionState): SessionFilter => ({
  minLevel: s.minLevel,
  tagContains: s.tagContains,
  keyword: s.keyword,
  scope: s.scope,
  pidSet: s.binding.pidSet(),
});

export function createLogStore() {
  const [state, setState] = createStore({
    capturing: false,
    bufferLines: 0,
    overflowed: false,
    sessions: [] as LogSessionState[],
    activeSessionId: null as number | null,
    processEntries: [] as ProcessEntry[],
    indexDegraded: false,
    indexUpdatedAt: null as number | null,
  });

  const mirror = new RingMirror(settingsStore.state.buffer_capacity || 50_000);

  const focusSerial = (): string | null => deviceStore.state.focusSerial;
  const displayLimit = (): number => settingsStore.state.display_limit || 2_000;

  const sessionIndex = (id: number): number =>
    state.sessions.findIndex((s) => s.id === id);

  function makeSession(scope: SessionScope, title: string): LogSessionState {
    return {
      id: nextSessionId++,
      title,
      scope,
      minLevel: null,
      tagContains: "",
      keyword: "",
      paused: false,
      autoScroll: true,
      signalCount: 0,
      visible: [],
      binding: new PidBinding(),
    };
  }

  /** 用缓冲镜像重建某会话可见区（过滤变更/回补/清设备缓冲）。 */
  function rebuildSession(id: number): void {
    const idx = sessionIndex(id);
    if (idx < 0) return;
    const session = state.sessions[idx]!;
    const f = toFilter(session);
    const lines = mirror.replay((line) => matchesLine(line, f), displayLimit());
    const visible = collapseStack(lines);
    const signalCount = lines.reduce((acc, l) => acc + (scanSignal(l) ? 1 : 0), 0);
    setState("sessions", idx, { visible, signalCount });
  }

  function rebuildAll(): void {
    state.sessions.forEach((s) => rebuildSession(s.id));
  }

  /** 确保至少一个会话。 */
  function ensureSession(): number {
    if (state.sessions.length === 0) {
      const session = makeSession({ kind: "all" }, "全部日志");
      setState("sessions", [session]);
      setState("activeSessionId", session.id);
      return session.id;
    }
    const active = state.activeSessionId;
    if (active !== null && sessionIndex(active) >= 0) return active;
    const first = state.sessions[0]!.id;
    setState("activeSessionId", first);
    return first;
  }

  function createSession(scope: SessionScope, title: string): number {
    const session = makeSession(scope, title);
    setState("sessions", (s) => [...s, session]);
    setState("activeSessionId", session.id);
    // 新会话用现有缓冲立即重放
    const f = toFilter(session);
    const lines = mirror.replay((line) => matchesLine(line, f), displayLimit());
    setState("sessions", (s) =>
      s.map((x) =>
        x.id === session.id
          ? {
              ...x,
              visible: collapseStack(lines),
              signalCount: lines.reduce((acc, l) => acc + (scanSignal(l) ? 1 : 0), 0),
            }
          : x,
      ),
    );
    return session.id;
  }

  function closeSession(id: number): void {
    const idx = sessionIndex(id);
    if (idx < 0) return;
    setState("sessions", (s) => s.filter((x) => x.id !== id));
    if (state.activeSessionId === id) {
      const remaining = state.sessions.filter((x) => x.id !== id);
      if (remaining.length === 0) {
        // 关最后一个 → 重建默认 All
        const fresh = makeSession({ kind: "all" }, "全部日志");
        setState("sessions", [fresh]);
        setState("activeSessionId", fresh.id);
      } else {
        setState("activeSessionId", remaining[0]!.id);
      }
    }
  }

  function setActive(id: number): void {
    setState("activeSessionId", id);
  }

  /** 更新会话过滤字段并重建可见区（仅当前会话）。 */
  function patchFilter(id: number, patch: Partial<LogSessionState>): void {
    const idx = sessionIndex(id);
    if (idx < 0) return;
    setState("sessions", idx, patch);
    rebuildSession(id);
  }

  // ===== 采集控制 =====

  async function startCapture(): Promise<void> {
    const serial = focusSerial();
    if (!serial) return;
    ensureSession();
    await logCaptureStart(serial);
    setState("capturing", true);
  }

  async function stopCapture(): Promise<void> {
    const serial = focusSerial();
    if (!serial) return;
    await logCaptureStop(serial);
    setState("capturing", false);
  }

  async function clearVisible(id: number): Promise<void> {
    const idx = sessionIndex(id);
    if (idx >= 0) {
      setState("sessions", idx, { visible: [], signalCount: 0 });
    }
  }

  async function clearDevice(): Promise<void> {
    const serial = focusSerial();
    if (!serial) return;
    await logClearDevice(serial);
    mirror.clear();
    setState("bufferLines", 0);
    rebuildAll();
  }

  async function clearShared(): Promise<void> {
    const serial = focusSerial();
    if (!serial) return;
    await logClear(serial);
    mirror.clear();
    setState("bufferLines", 0);
    rebuildAll();
  }

  async function exportSession(id: number): Promise<string | null> {
    const serial = focusSerial();
    if (!serial) return null;
    const session = state.sessions.find((s) => s.id === id);
    if (!session) return null;
    const f = toFilter(session);
    const filter: LogFilter = {
      min_level: f.minLevel ?? undefined,
      tag_contains: f.tagContains || undefined,
      message_contains: f.keyword || undefined,
      exact_pid: session.scope.kind === "pid" ? session.scope.pid : undefined,
      pid_set: f.pidSet,
    };
    const result = await logExport({ serial, filter });
    return result.path;
  }

  // ===== 批量事件处理 =====

  function onBatch(batch: LogBatch): void {
    if (batch.serial !== focusSerial()) return;
    mirror.pushBatch(batch);
    setState("bufferLines", mirror.size());
    setState("overflowed", false);

    // 各未暂停会话过滤追加（尾部裁剪到 display.limit）
    state.sessions.forEach((session) => {
      if (session.paused) return;
      const f = toFilter(session);
      const matched = batch.lines.filter((line) => matchesLine(line, f));
      if (matched.length === 0) return;
      const idx = sessionIndex(session.id);
      const current = state.sessions[idx]!.visible;
      const merged = [...current, ...collapseStack(matched)];
      const trimmed = merged.length > displayLimit() ? merged.slice(merged.length - displayLimit()) : merged;
      const signals = matched.reduce((acc, l) => acc + (scanSignal(l) ? 1 : 0), 0);
      setState("sessions", idx, {
        visible: trimmed,
        signalCount: session.signalCount + signals,
      });
    });
  }

  async function onOverflow(serial: string): Promise<void> {
    if (serial !== focusSerial()) return;
    setState("overflowed", true);
    try {
      const from = mirror.lastSeqNumber() + 1;
      const batch = await logReplay({ serial, from_seq: from, limit: 100_000 });
      onBatch(batch);
    } catch (e) {
      console.error("log.replay 回补失败", e);
    }
  }

  function onIndex(snapshot: { serial: string; entries: ProcessEntry[]; degraded: boolean }): void {
    if (snapshot.serial !== focusSerial()) return;
    setState({ processEntries: snapshot.entries, indexDegraded: snapshot.degraded, indexUpdatedAt: Date.now() });
    // 包名会话重绑（历史集在 binding 内维护；可见区无需重建：旧行不因新 PID 变化）
    state.sessions.forEach((session) => {
      if (session.scope.kind !== "package") return;
      session.binding.rebind(snapshot.entries, session.scope.pkg, session.scope.includeChild);
    });
  }

  function onOffline(serial: string): void {
    if (serial !== focusSerial()) return;
    setState("capturing", false);
    mirror.clear();
    setState("bufferLines", 0);
    rebuildAll();
  }

  // ===== 事件订阅 =====
  void onLogBatch((e) => onBatch(e.batch));
  void onLogOverflow((e) => void onOverflow(e.serial));
  void onProcessIndex((e) => onIndex(e));
  void onCaptureState((e) => {
    if (e.serial === focusSerial()) setState("capturing", e.state === "running");
  });
  void onDeviceOffline((e) => onOffline(e.serial));

  return {
    state,
    mirror,
    ensureSession,
    createSession,
    closeSession,
    setActive,
    patchFilter,
    startCapture,
    stopCapture,
    clearVisible,
    clearDevice,
    clearShared,
    exportSession,
    focusSerial,
    displayLimit,
  };
}

/** 模块级单例。 */
export const logStore = createLogStore();
