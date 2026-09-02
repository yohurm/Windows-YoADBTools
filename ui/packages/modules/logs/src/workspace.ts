/**
 * 日志会话工作区：窗口（Tab）生命周期、显示过滤、包名 PID 重绑。
 * 不碰采集 IPC。每个窗口绑定一台设备；新建/复制空且停，不从共享环重放。
 * 进程索引按 serial 分桶，禁止用焦点设备的 ps 去重绑其他窗口。
 *
 * 显示面板是窗口私有、append-only。只在重新开始采集或清空时 flush。
 * 掉线 / 停采 / 无输出 / PID 重绑 / 跟滚 / 镜像落后都不得冲掉已画出的行。
 * 镜像只按 seq 补洞，禁止整表替换面板。
 */

import type { SetStoreFunction } from "solid-js/store";
import type { LogLine, ProcessEntry } from "@yohu/api";

import {
  appendLines,
  countSignals,
  keepMatching,
  lastSeqOf,
  panelFromLines,
  trimRows,
} from "./panel";
import {
  copyBinding,
  emptyBinding,
  matchesLine,
  rebindPids,
  toSessionFilter,
  type PidBinding,
  type SessionScope,
  type ViewRow,
} from "./pipeline";
import type { MirrorBank } from "./pipeline";

/** 从未开始采集：入镜/补洞均跳过共享环。 */
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
  /** 本窗口起始序号；<0 表示从未开始，禁止从镜像补洞 */
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

/** 显示过滤补丁。暂停走 setPaused，禁止经 patchFilter 整表重建。 */
export type SessionFilterPatch = Partial<
  Pick<LogSessionState, "minLevel" | "tagContains" | "keyword" | "scope" | "paused">
>;

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
  patchFilter: (id: number, patch: SessionFilterPatch) => void;
  setPaused: (id: number, paused: boolean) => void;
  trimPanels: () => void;
  catchUpSession: (id: number) => void;
  bindPackageSessions: (serial: string, entries?: readonly ProcessEntry[]) => void;
  assignDefaultSerial: (serial: string | null) => void;
  clearPanel: (id: number) => void;
  clearDevicePanels: (serial: string) => void;
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

const DISPLAY_KEYS: readonly (keyof SessionFilterPatch)[] = ["minLevel", "tagContains", "keyword", "scope"];

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

  function writePanel(idx: number, rows: ViewRow[], signalCount: number, pendingCount: number): void {
    setState("sessions", idx, {
      visible: trimRows(rows, bufferCapacity()),
      signalCount,
      pendingCount,
    });
  }

  function clearPanel(id: number): void {
    const idx = sessionIndex(id);
    if (idx < 0) return;
    writePanel(idx, [], 0, 0);
  }

  function clearDevicePanels(serial: string): void {
    state.sessions.forEach((session) => {
      if (session.serial !== serial) return;
      clearPanel(session.id);
    });
  }

  function extraFromMirror(session: LogSessionState, after: number): LogLine[] {
    if (session.fromSeq < 0 || !session.serial) return [];
    const filter = toSessionFilter(session);
    return mirrors.of(session.serial).replay((line) => {
      if (line.seq <= after || line.seq < session.fromSeq) return false;
      return matchesLine(line, filter);
    }, bufferCapacity());
  }

  /** 按 seq 追加镜像里尚未画出的匹配行。空面板可以首次填入，但不得整表替换。 */
  function catchUpSession(id: number): void {
    const idx = sessionIndex(id);
    if (idx < 0) return;
    const session = state.sessions[idx]!;
    if (session.paused) return;
    const after = lastSeqOf(session.visible, session.fromSeq);
    const lines = extraFromMirror(session, after);
    if (lines.length === 0) {
      if (session.following) setState("sessions", idx, { pendingCount: 0 });
      return;
    }
    const signals = session.signalCount + countSignals(lines);
    if (!session.following) {
      setState("sessions", idx, {
        pendingCount: session.pendingCount + lines.length,
        signalCount: signals,
      });
      return;
    }
    writePanel(idx, appendLines(session.visible, lines, bufferCapacity()), signals, 0);
  }

  /**
   * 用户改了级别/Tag/关键字：保留面板里仍匹配的行，再按 seq 从镜像补新命中。
   * 镜像为空时只可能变少（过滤变严），不会把已有行冲成空。
   */
  function refilterSession(id: number): void {
    const idx = sessionIndex(id);
    if (idx < 0) return;
    const session = state.sessions[idx]!;
    const filter = toSessionFilter(session);
    const kept = keepMatching(session.visible, filter);
    const after = kept.length > 0 ? kept[kept.length - 1]!.seq : lastSeqOf([], session.fromSeq);
    const extra = extraFromMirror(session, after);
    const next = panelFromLines([...kept, ...extra], bufferCapacity());
    writePanel(idx, next.visible, next.signalCount, 0);
  }

  function trimPanels(): void {
    const cap = bufferCapacity();
    state.sessions.forEach((session, idx) => {
      const trimmed = trimRows(session.visible, cap);
      if (trimmed.length === session.visible.length) return;
      setState("sessions", idx, { visible: trimmed });
    });
  }

  function bindPackageSessions(serial: string, entries?: readonly ProcessEntry[]): void {
    const index = entries ?? processIndexOf(serial);
    state.sessions.forEach((session, idx) => {
      if (session.scope.kind !== "package") return;
      if (session.serial !== serial) return;
      const binding = rebindPids(session.binding, index, session.scope.pkg, session.scope.includeChild);
      setState("sessions", idx, { binding });
      if (state.sessions[idx]!.following && !state.sessions[idx]!.paused) {
        catchUpSession(session.id);
      }
    });
  }

  function assignDefaultSerial(serial: string | null): void {
    state.sessions.forEach((session, idx) => {
      if (session.serial === null) {
        setState("sessions", idx, { serial });
      }
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

  function rebindIfPackage(idx: number): void {
    const next = state.sessions[idx]!;
    if (next.scope.kind !== "package") return;
    const binding = rebindPids(
      next.binding,
      processIndexOf(next.serial),
      next.scope.pkg,
      next.scope.includeChild,
    );
    setState("sessions", idx, { binding });
  }

  function patchFilter(id: number, patch: SessionFilterPatch): void {
    const idx = sessionIndex(id);
    if (idx < 0) return;
    const { paused, ...display } = patch;
    if (Object.keys(display).length > 0) {
      setState("sessions", idx, display);
      rebindIfPackage(idx);
    }
    if (paused !== undefined) {
      setState("sessions", idx, { paused });
    }
    const displayChanged = DISPLAY_KEYS.some((key) => key in patch);
    if (displayChanged) {
      refilterSession(id);
      return;
    }
    if (paused === false) catchUpSession(id);
  }

  function setPaused(id: number, paused: boolean): void {
    const idx = sessionIndex(id);
    if (idx < 0) return;
    if (state.sessions[idx]!.paused === paused) return;
    setState("sessions", idx, { paused });
    if (!paused) catchUpSession(id);
  }

  function setFollowing(id: number, following: boolean): void {
    const idx = sessionIndex(id);
    if (idx < 0) return;
    const session = state.sessions[idx]!;
    if (session.following === following) return;
    if (following) {
      setState("sessions", idx, { following: true, pendingCount: 0 });
      catchUpSession(id);
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
    setPaused,
    trimPanels,
    catchUpSession,
    bindPackageSessions,
    assignDefaultSerial,
    clearPanel,
    clearDevicePanels,
    setFollowing,
    resumeFollow: (id) => setFollowing(id, true),
    detachFollow: (id) => setFollowing(id, false),
  };
}
