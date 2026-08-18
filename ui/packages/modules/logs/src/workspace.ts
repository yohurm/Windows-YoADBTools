/**
 * 日志会话工作区：Tab 生命周期、过滤补丁、包名 PID 重绑后的可见区重建。
 * 不碰采集 IPC。
 */

import type { SetStoreFunction } from "solid-js/store";
import type { ProcessEntry } from "@yovo/api";

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
import type { RingMirror } from "./pipeline";

export interface LogSessionState {
  id: number;
  title: string;
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

export interface LogUiState {
  serial: string | null;
  capturing: boolean;
  overflowed: boolean;
  sessions: LogSessionState[];
  activeSessionId: number | null;
  processEntries: ProcessEntry[];
  indexDegraded: boolean;
  /** 与 core `buffer.capacity` 对齐：镜像与可见区同一上限 */
  bufferCapacity: number;
}

export type WorkspaceApi = {
  ensureSession: () => number;
  createSession: (scope: SessionScope, title: string) => number;
  closeSession: (id: number) => void;
  closeOthers: (id: number) => void;
  renameSession: (id: number, title: string) => void;
  duplicateSession: (id: number) => number | null;
  setActive: (id: number) => void;
  patchFilter: (id: number, patch: Partial<LogSessionState>) => void;
  rebuildAll: () => void;
  bindPackageSessions: () => void;
  setFollowing: (id: number, following: boolean) => void;
  resumeFollow: (id: number) => void;
  detachFollow: (id: number) => void;
};

let nextSessionId = 1;

export function createWorkspace(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  mirror: RingMirror,
): WorkspaceApi {
  const sessionIndex = (id: number): number => state.sessions.findIndex((s) => s.id === id);
  const bufferCapacity = (): number => state.bufferCapacity;

  function makeSession(scope: SessionScope, title: string): LogSessionState {
    const session: LogSessionState = {
      id: nextSessionId++,
      title,
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
      session.binding = rebindPids(session.binding, state.processEntries, scope.pkg, scope.includeChild);
    }
    return session;
  }

  function rebuildSession(id: number): void {
    const idx = sessionIndex(id);
    if (idx < 0) return;
    const session = state.sessions[idx]!;
    const filter = toSessionFilter(session);
    const lines = mirror.replay((line) => matchesLine(line, filter), bufferCapacity());
    const visible = collapseStack(lines);
    const signalCount = lines.reduce((acc, l) => acc + (scanSignal(l) ? 1 : 0), 0);
    setState("sessions", idx, { visible, signalCount, pendingCount: 0 });
  }

  function rebuildAll(): void {
    state.sessions.forEach((s) => rebuildSession(s.id));
  }

  function bindPackageSessions(): void {
    state.sessions.forEach((session, idx) => {
      if (session.scope.kind !== "package") return;
      const binding = rebindPids(session.binding, state.processEntries, session.scope.pkg, session.scope.includeChild);
      setState("sessions", idx, { binding });
      rebuildSession(session.id);
    });
  }

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
    rebuildSession(session.id);
    return session.id;
  }

  function closeSession(id: number): void {
    const idx = sessionIndex(id);
    if (idx < 0) return;
    setState("sessions", (s) => s.filter((x) => x.id !== id));
    if (state.activeSessionId === id) {
      const remaining = state.sessions.filter((x) => x.id !== id);
      if (remaining.length === 0) {
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

  function renameSession(id: number, title: string): void {
    const idx = sessionIndex(id);
    const trimmed = title.trim();
    if (idx < 0 || trimmed.length === 0) return;
    setState("sessions", idx, { title: trimmed });
  }

  function duplicateSession(id: number): number | null {
    const src = state.sessions.find((s) => s.id === id);
    if (!src) return null;
    const copy = makeSession({ ...src.scope }, `${src.title} 副本`);
    copy.minLevel = src.minLevel;
    copy.tagContains = src.tagContains;
    copy.keyword = src.keyword;
    copy.paused = src.paused;
    copy.following = src.following;
    copy.binding = copyBinding(src.binding);
    setState("sessions", (s) => [...s, copy]);
    setState("activeSessionId", copy.id);
    rebuildSession(copy.id);
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
      const binding = rebindPids(next.binding, state.processEntries, next.scope.pkg, next.scope.includeChild);
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
    bindPackageSessions,
    setFollowing,
    resumeFollow: (id) => setFollowing(id, true),
    detachFollow: (id) => setFollowing(id, false),
  };
}
