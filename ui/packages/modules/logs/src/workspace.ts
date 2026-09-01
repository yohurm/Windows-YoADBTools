/**
 * 日志会话工作区：窗口（Tab）生命周期、过滤补丁、包名 PID 重绑后的可见区重建。
 * 不碰采集 IPC。每个窗口绑定一台设备；新建/复制空且停，不从共享环重放。
 * 进程索引按 serial 分桶，禁止用焦点设备的 ps 去重绑其他窗口。
 */

import type { SetStoreFunction } from "solid-js/store";
import type { ProcessEntry } from "@yohu/api";

import {
  collapseStack,
  copyBinding,
  emptyBinding,
  matchesLine,
  rebindPids,
  scanSignal,
  toSessionFilter,
  type PidBinding,
  type SessionScope,
  type ViewRow,
} from "./pipeline";
import type { MirrorBank } from "./pipeline";

/** 从未开始采集：重建/入镜均跳过共享环。 */
export const SESSION_NEVER_STARTED = -1;

export const SYSTEM_SESSION_TITLE = "System";

export interface LogSessionState {
  id: number;
  title: string;
  /** 窗口绑定的设备；空表示尚未选定 */
  serial: string | null;
  /** 本窗口是否在消费该设备的 logcat 扇出 */
  capturing: boolean;
  /** start IPC 进行中；空态/按钮不得再显示「未采集」 */
  starting: boolean;
  /** 本窗口起始序号；<0 表示从未开始，禁止重放镜像 */
  fromSeq: number;
  scope: SessionScope;
  minLevel: string | null;
  tagContains: string;
  keyword: string;
  paused: boolean;
  /** 贴底跟滚；离开底部后冻结可见区，只累计 pendingCount */
  following: boolean;
  pendingCount: number;
  signalCount: number;
  visible: ViewRow[];
  binding: PidBinding;
}

/** 每设备一份投影：世代 / 溢出 / 进程索引。窗口只引用 serial，不共用全局数组。 */
export interface DeviceUiState {
  generation: number;
  overflowed: boolean;
  processEntries: ProcessEntry[];
  indexDegraded: boolean;
}

export interface LogUiState {
  /** 左侧焦点：新建窗口的默认设备，不等于唯一采集设备 */
  serial: string | null;
  /** 按 serial 分桶的设备投影 */
  devices: Record<string, DeviceUiState>;
  sessions: LogSessionState[];
  activeSessionId: number | null;
  /** 与 core `buffer_capacity` 对齐：镜像与可见区同一上限 */
  bufferCapacity: number;
}

export type WorkspaceApi = {
  ensureSession: () => number;
  createSession: (scope: SessionScope, title: string, serial?: string | null) => number;
  closeSession: (id: number) => void;
  closeOthers: (id: number) => void;
  renameSession: (id: number, title: string) => void;
  duplicateSession: (id: number) => number | null;
  setActive: (id: number) => void;
  patchFilter: (id: number, patch: Partial<LogSessionState>) => void;
  rebuildAll: () => void;
  rebuildSession: (id: number) => void;
  bindPackageSessions: (serial: string, entries?: readonly ProcessEntry[]) => void;
  assignDefaultSerial: (serial: string | null) => void;
  resetDeviceViews: (serial: string) => void;
  setFollowing: (id: number, following: boolean) => void;
  resumeFollow: (id: number) => void;
  detachFollow: (id: number) => void;
};

let nextSessionId = 1;

export function emptyDevice(): DeviceUiState {
  return { generation: 0, overflowed: false, processEntries: [], indexDegraded: false };
}

export function deviceSlice(state: LogUiState, serial: string | null | undefined): DeviceUiState {
  if (!serial) return emptyDevice();
  return state.devices[serial] ?? emptyDevice();
}

export function ensureDevice(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  serial: string,
): void {
  if (state.devices[serial]) return;
  setState("devices", serial, emptyDevice());
}

export function createWorkspace(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  mirrors: MirrorBank,
): WorkspaceApi {
  const sessionIndex = (id: number): number => state.sessions.findIndex((s) => s.id === id);
  const bufferCapacity = (): number => state.bufferCapacity;

  function processIndexOf(serial: string | null): readonly ProcessEntry[] {
    return deviceSlice(state, serial).processEntries;
  }

  function makeSession(scope: SessionScope, title: string, serial: string | null): LogSessionState {
    const session: LogSessionState = {
      id: nextSessionId++,
      title,
      serial,
      capturing: false,
      starting: false,
      fromSeq: SESSION_NEVER_STARTED,
      scope,
      minLevel: null,
      tagContains: "",
      keyword: "",
      paused: false,
      following: true,
      pendingCount: 0,
      signalCount: 0,
      visible: [],
      binding: emptyBinding(),
    };
    if (scope.kind === "package") {
      session.binding = rebindPids(session.binding, processIndexOf(serial), scope.pkg, scope.includeChild);
    }
    return session;
  }

  function rebuildSession(id: number): void {
    const idx = sessionIndex(id);
    if (idx < 0) return;
    const session = state.sessions[idx]!;
    if (session.fromSeq < 0 || !session.serial) {
      setState("sessions", idx, { visible: [], signalCount: 0, pendingCount: 0 });
      return;
    }
    const filter = toSessionFilter(session);
    const lines = mirrors.of(session.serial).replay((line) => {
      if (line.seq < session.fromSeq) return false;
      return matchesLine(line, filter);
    }, bufferCapacity());
    const visible = collapseStack(lines);
    const signalCount = lines.reduce((acc, l) => acc + (scanSignal(l) ? 1 : 0), 0);
    setState("sessions", idx, { visible, signalCount, pendingCount: 0 });
  }

  function rebuildAll(): void {
    state.sessions.forEach((s) => rebuildSession(s.id));
  }

  function bindPackageSessions(serial: string, entries?: readonly ProcessEntry[]): void {
    const index = entries ?? processIndexOf(serial);
    state.sessions.forEach((session, idx) => {
      if (session.scope.kind !== "package") return;
      if (session.serial !== serial) return;
      const binding = rebindPids(session.binding, index, session.scope.pkg, session.scope.includeChild);
      setState("sessions", idx, { binding });
      rebuildSession(session.id);
    });
  }

  function assignDefaultSerial(serial: string | null): void {
    state.sessions.forEach((session, idx) => {
      if (session.serial === null) {
        setState("sessions", idx, { serial });
      }
    });
  }

  function resetDeviceViews(serial: string): void {
    state.sessions.forEach((session, idx) => {
      if (session.serial !== serial) return;
      setState("sessions", idx, {
        capturing: false,
        starting: false,
        fromSeq: SESSION_NEVER_STARTED,
        visible: [],
        signalCount: 0,
        pendingCount: 0,
      });
    });
  }

  function ensureSession(): number {
    if (state.sessions.length === 0) {
      const session = makeSession({ kind: "all" }, SYSTEM_SESSION_TITLE, state.serial);
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

  function createSession(scope: SessionScope, title: string, serial?: string | null): number {
    const session = makeSession(scope, title, serial !== undefined ? serial : state.serial);
    setState("sessions", (s) => [...s, session]);
    setState("activeSessionId", session.id);
    return session.id;
  }

  function closeSession(id: number): void {
    const idx = sessionIndex(id);
    if (idx < 0) return;
    setState("sessions", (s) => s.filter((x) => x.id !== id));
    if (state.activeSessionId === id) {
      const remaining = state.sessions.filter((x) => x.id !== id);
      if (remaining.length === 0) {
        const fresh = makeSession({ kind: "all" }, SYSTEM_SESSION_TITLE, state.serial);
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

  function renameSession(id: number, title: string): void {
    const idx = sessionIndex(id);
    const trimmed = title.trim();
    if (idx < 0 || trimmed.length === 0) return;
    setState("sessions", idx, { title: trimmed });
  }

  function duplicateSession(id: number): number | null {
    const src = state.sessions.find((s) => s.id === id);
    if (!src) return null;
    const copy = makeSession({ ...src.scope }, `${src.title} 副本`, src.serial);
    copy.minLevel = src.minLevel;
    copy.tagContains = src.tagContains;
    copy.keyword = src.keyword;
    copy.paused = false;
    copy.following = true;
    copy.capturing = false;
    copy.starting = false;
    copy.fromSeq = SESSION_NEVER_STARTED;
    copy.binding = copyBinding(src.binding);
    setState("sessions", (s) => [...s, copy]);
    setState("activeSessionId", copy.id);
    return copy.id;
  }

  function closeOthers(id: number): void {
    const target = state.sessions.find((s) => s.id === id);
    if (!target) return;
    setState("sessions", [target]);
    setState("activeSessionId", id);
  }

  function patchFilter(id: number, patch: Partial<LogSessionState>): void {
    const idx = sessionIndex(id);
    if (idx < 0) return;
    setState("sessions", idx, patch);
    const next = state.sessions[idx]!;
    if (next.scope.kind === "package") {
      const binding = rebindPids(
        next.binding,
        processIndexOf(next.serial),
        next.scope.pkg,
        next.scope.includeChild,
      );
      setState("sessions", idx, { binding });
    }
    rebuildSession(id);
  }

  function setFollowing(id: number, following: boolean): void {
    const idx = sessionIndex(id);
    if (idx < 0) return;
    const session = state.sessions[idx]!;
    if (session.following === following) return;
    if (following) {
      setState("sessions", idx, { following: true, pendingCount: 0 });
      rebuildSession(id);
      return;
    }
    setState("sessions", idx, { following: false });
  }

  return {
    ensureSession,
    createSession,
    closeSession,
    closeOthers,
    renameSession,
    duplicateSession,
    setActive,
    patchFilter,
    rebuildAll,
    rebuildSession,
    bindPackageSessions,
    assignDefaultSerial,
    resetDeviceViews,
    setFollowing,
    resumeFollow: (id) => setFollowing(id, true),
    detachFollow: (id) => setFollowing(id, false),
  };
}
